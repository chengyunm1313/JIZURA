"""MV Timeline v1 格式、同意流程與本機合成整合測試。"""
import contextlib
import io
import json
import shutil
import subprocess
import struct
import sys
import tempfile
import unittest
import zlib
from pathlib import Path
from types import SimpleNamespace
from unittest import mock

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "tools"))
import mv_engine as engine


class MVEngineTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory(prefix="jizura-mv-test-")
        self.root = Path(self.temp.name)
        self.make_project()

    def tearDown(self):
        self.temp.cleanup()

    def make_project(self):
        for name in ("assets/audio", "assets/video", "render"):
            (self.root / name).mkdir(parents=True, exist_ok=True)
        (self.root / "assets/audio/song.wav").write_bytes(b"fixture audio")
        (self.root / "assets/video/shot-a.mp4").write_bytes(b"fixture video a")
        (self.root / "assets/video/shot-b.mp4").write_bytes(b"fixture video b")
        self.catalog = {
            "schemaVersion": 1,
            "styles": [{"id": "noir", "name": "Noir"}, {"id": "crimson", "name": "Crimson"}],
            "transitions": [{"id": "wipe", "name": "Wipe"}],
        }
        engine.write_json(self.root / "catalog.json", self.catalog)
        self.timeline = {
            "schemaVersion": 1, "approved": True,
            "project": {"title": "Fixture", "artist": "Test", "width": 64, "height": 64, "fps": 24,
                        "durationFrames": 48, "aspect": "1:1", "resolution": 64},
            "assets": [
                {"id": "audio-001", "kind": "audio", "path": "assets/audio/song.wav", "name": "song.wav", "size": 13},
                {"id": "video-001", "kind": "video", "path": "assets/video/shot-a.mp4", "name": "shot-a.mp4", "size": 15,
                 "durationUs": 1_000_000, "width": 64, "height": 64},
                {"id": "video-002", "kind": "video", "path": "assets/video/shot-b.mp4", "name": "shot-b.mp4", "size": 15,
                 "durationUs": 1_000_000, "width": 64, "height": 64},
            ],
            "audio": {"assetId": "audio-001", "durationUs": 2_000_000},
            "beats": [{"id": f"beat-{i}", "frame": i, "strength": 0.5} for i in (0, 12, 24, 36)],
            "audioFeatures": {"bpm": 120, "energyRateHz": 20,
                              "energy": [{"frame": 0, "value": 0.4}, {"frame": 24, "value": 0.8}]},
            "sections": [
                {"id": "section-001", "type": "verse", "startFrame": 0, "endFrame": 24, "confidence": 0.8,
                 "locked": False, "shotDescription": "Wide red shot"},
                {"id": "section-002", "type": "chorus", "startFrame": 24, "endFrame": 48, "confidence": 0.9,
                 "locked": False, "shotDescription": "Blue chorus shot"},
            ],
            "lyrics": [
                {"id": "lyric-001", "lineIndex": 0, "text": "Test lyric one", "startFrame": 2, "endFrame": 20},
                {"id": "lyric-002", "lineIndex": 1, "text": "Test lyric two", "startFrame": 26, "endFrame": 44},
            ],
            "shots": [
                {"id": "shot-001", "assetId": "video-001", "startFrame": 0, "endFrame": 24,
                 "sourceInUs": 0, "sourceOutUs": 1_000_000, "fit": "cover", "description": "Red"},
                {"id": "shot-002", "assetId": "video-002", "startFrame": 24, "endFrame": 48,
                 "sourceInUs": 0, "sourceOutUs": 1_000_000, "fit": "cover", "description": "Blue"},
            ],
            "styles": [{"sectionId": "section-001", "styleId": "noir"},
                       {"sectionId": "section-002", "styleId": "crimson"}],
            "transitions": [{"atFrame": 24, "transitionId": "wipe", "durationFrames": 6}],
            "render": {"backPattern": "render/mg/back/frame_%06d.png",
                       "frontPattern": "render/mg/front/frame_%06d.png", "frameCount": 48,
                       "layersStatus": "missing"},
        }
        engine.write_json(self.root / "timeline.json", self.timeline)

    def test_timeline_assets_and_contiguous_sections_validate(self):
        self.assertEqual(engine.validate_timeline(self.root, self.timeline, require_assets=True, require_shots=True), [])

    def test_unsafe_asset_path_is_rejected(self):
        invalid = json.loads(json.dumps(self.timeline))
        invalid["assets"][0]["path"] = "../outside.wav"
        errors = engine.validate_timeline(self.root, invalid)
        self.assertTrue(any("安全" in error or "之外" in error for error in errors), errors)

    def test_ai_requires_consent_before_reading_or_network(self):
        with mock.patch.object(engine.urllib.request, "urlopen") as urlopen, mock.patch.object(engine, "read_json") as read_json:
            with self.assertRaisesRegex(engine.MVError, "明確同意"):
                engine.command_ai_plan(self.root, SimpleNamespace(consent_lyrics_features=False))
        urlopen.assert_not_called()
        read_json.assert_not_called()

    def test_render_stops_when_ffmpeg_is_missing_without_installing(self):
        with mock.patch.object(engine.shutil, "which", return_value=None), mock.patch.object(engine, "read_json") as read_json:
            with self.assertRaisesRegex(engine.MVError, "不會自動下載或安裝"):
                engine.command_render(self.root, SimpleNamespace(approved=True))
        read_json.assert_not_called()

    def test_ai_request_sends_only_approved_text_features_and_writes_proposal(self):
        suggestion = {"sections": [
            {"type": "verse", "startFrame": 0, "endFrame": 24, "confidence": 0.8, "styleId": "noir",
             "transitionId": "none", "shotDescription": "A quiet opening"},
            {"type": "chorus", "startFrame": 24, "endFrame": 48, "confidence": 0.9, "styleId": "crimson",
             "transitionId": "wipe", "shotDescription": "A bright chorus"},
        ]}
        response_payload = {"output": [{"type": "message", "content": [
            {"type": "output_text", "text": json.dumps(suggestion)}]}]}
        captured = {}

        class Response:
            def __enter__(self): return self
            def __exit__(self, *_): return False
            def read(self): return json.dumps(response_payload).encode()

        def fake_open(request, timeout):
            captured["body"] = json.loads(request.data)
            captured["url"] = request.full_url
            captured["timeout"] = timeout
            return Response()

        original = (self.root / "timeline.json").read_bytes()
        stdout = io.StringIO()
        with mock.patch.object(engine, "keychain_get", return_value="test-only-secret"), \
             mock.patch.object(engine.urllib.request, "urlopen", side_effect=fake_open) as urlopen, \
             contextlib.redirect_stdout(stdout):
            engine.command_ai_plan(self.root, SimpleNamespace(consent_lyrics_features=True, model="test-model"))
        urlopen.assert_called_once()
        self.assertEqual(captured["url"], "https://api.openai.com/v1/responses")
        self.assertFalse(captured["body"]["store"])
        sent = json.dumps(captured["body"], ensure_ascii=False)
        self.assertIn("Test lyric one", sent)
        self.assertIn("energy", sent)
        self.assertNotIn("assets/audio", sent)
        self.assertNotIn("song.wav", sent)
        self.assertNotIn(str(self.root), sent)
        self.assertEqual((self.root / "timeline.json").read_bytes(), original)
        self.assertTrue((self.root / "timeline.proposed.json").is_file())
        self.assertNotIn("test-only-secret", stdout.getvalue())
        self.assertNotIn("test-only-secret", (self.root / "timeline.proposed.json").read_text())

    def test_locked_section_and_style_survive_ai_merge(self):
        original = json.loads(json.dumps(self.timeline))
        original["sections"][0]["locked"] = True
        suggestion = {"sections": [
            {"type": "verse", "startFrame": 0, "endFrame": 12, "confidence": 0.2, "styleId": "crimson",
             "transitionId": "none", "shotDescription": "Ignored inside lock"},
            {"type": "bridge", "startFrame": 12, "endFrame": 30, "confidence": 0.7, "styleId": "crimson",
             "transitionId": "none", "shotDescription": "Bridge"},
            {"type": "chorus", "startFrame": 30, "endFrame": 48, "confidence": 0.9, "styleId": "noir",
             "transitionId": "wipe", "shotDescription": "Chorus"},
        ]}
        result = engine.normalize_suggestion(original, suggestion, self.catalog)
        locked = result["sections"][0]
        self.assertEqual((locked["id"], locked["type"], locked["startFrame"], locked["endFrame"], locked["locked"]),
                         ("section-001", "verse", 0, 24, True))
        self.assertEqual(result["styles"][0], {"sectionId": "section-001", "styleId": "noir"})
        self.assertEqual([(s["startFrame"], s["endFrame"]) for s in result["sections"]], [(0, 24), (24, 30), (30, 48)])

    def test_multishot_layers_audio_render_and_full_decode(self):
        ffmpeg, ffprobe = shutil.which("ffmpeg"), shutil.which("ffprobe")
        if not ffmpeg or not ffprobe:
            self.skipTest("需要本機已安裝 ffmpeg 與 ffprobe")
        for file_name, color in (("shot-a.mp4", "red"), ("shot-b.mp4", "blue")):
            target = self.root / "assets/video" / file_name
            subprocess_result = engine.run_checked(
                [ffmpeg, "-hide_banner", "-loglevel", "error", "-y", "-f", "lavfi", "-i",
                 f"color=c={color}:s=64x64:r=24:d=1", "-an", "-c:v", "libx264", "-pix_fmt", "yuv420p", str(target)],
                "建立本機測試影片")
            self.assertIsNotNone(subprocess_result)
        engine.run_checked([ffmpeg, "-hide_banner", "-loglevel", "error", "-y", "-f", "lavfi", "-i",
                            "sine=frequency=440:sample_rate=48000:duration=2", "-c:a", "pcm_s16le",
                            str(self.root / "assets/audio/song.wav")], "建立本機測試歌曲")
        for layer in ("back", "front"):
            (self.root / "render/mg" / layer).mkdir(parents=True, exist_ok=True)
        for frame in range(48):
            self.write_rgba_png(self.root / f"render/mg/back/frame_{frame:06d}.png", 64, 64, lambda _x, _y: (0, 0, 0, 0))
            active = 8 <= frame < 40
            self.write_rgba_png(self.root / f"render/mg/front/frame_{frame:06d}.png", 64, 64,
                                lambda x, y, active=active: (255, 255, 255, 220) if active and 12 <= x < 52 and 26 <= y < 38 else (0, 0, 0, 0))
        timeline = json.loads(json.dumps(self.timeline))
        timeline["render"]["layersStatus"] = "complete"
        engine.write_json(self.root / "timeline.json", timeline)
        engine.command_render(self.root, SimpleNamespace(approved=True, preset="ultrafast", crf=35))
        manifest = json.loads((self.root / "render/render-manifest.json").read_text())
        self.assertEqual(manifest["settings"]["durationFrames"], 48)
        self.assertEqual(manifest["settings"]["fps"], 24)
        self.assertEqual(manifest["verification"], {"ffprobe": "passed", "fullDecode": "passed"})

    @staticmethod
    def write_rgba_png(path, width, height, pixel):
        def chunk(kind, data):
            return struct.pack(">I", len(data)) + kind + data + struct.pack(">I", zlib.crc32(kind + data) & 0xffffffff)
        raw = bytearray()
        for y in range(height):
            raw.append(0)
            for x in range(width): raw.extend(pixel(x, y))
        data = (b"\x89PNG\r\n\x1a\n"
                + chunk(b"IHDR", struct.pack(">IIBBBBB", width, height, 8, 6, 0, 0, 0))
                + chunk(b"IDAT", zlib.compress(raw))
                + chunk(b"IEND", b""))
        path.write_bytes(data)


if __name__ == "__main__":
    unittest.main(verbosity=2)
