import tempfile
import unittest
from pathlib import Path

from transcode import build_variant_ladder, verify_hls_output


class VariantLadderTests(unittest.TestCase):
    def test_full_hd_source_gets_four_non_upscaled_renditions(self):
        variants = build_variant_ladder(1920, 1080)
        self.assertEqual([360, 480, 720, 1080], [item.height for item in variants])
        self.assertEqual([(640, 360), (852, 480), (1280, 720), (1920, 1080)],
                         [(item.width, item.height) for item in variants])
        self.assertTrue(all(item.width % 2 == 0 and item.height % 2 == 0 for item in variants))

    def test_720p_source_is_not_upscaled(self):
        variants = build_variant_ladder(1280, 720)
        self.assertEqual([360, 480, 720], [item.height for item in variants])
        self.assertLessEqual(max(item.height for item in variants), 720)

    def test_small_source_gets_one_native_size_rendition(self):
        variants = build_variant_ladder(426, 240)
        self.assertEqual([(426, 240)], [(item.width, item.height) for item in variants])

 
    def test_hls_verifier_checks_master_variants_and_segments(self):
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            variant = root / "v360"
            variant.mkdir()
            (root / "master.m3u8").write_text(
                "#EXTM3U\n#EXT-X-STREAM-INF:BANDWIDTH=1000\nv360/index.m3u8\n",
                encoding="utf-8",
            )
            (variant / "index.m3u8").write_text(
                "#EXTM3U\n#EXTINF:4.0,\nsegment_00000.ts\n#EXT-X-ENDLIST\n",
                encoding="utf-8",
            )
            (variant / "segment_00000.ts").write_bytes(b"media")
            result = verify_hls_output(root)
            self.assertEqual({"renditionCount": 1, "segmentCount": 1, "segmentBytes": 5}, result)

    def test_hls_verifier_rejects_missing_segment(self):
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            variant = root / "v360"
            variant.mkdir()
            (root / "master.m3u8").write_text(
                "#EXTM3U\n#EXT-X-STREAM-INF:BANDWIDTH=1000\nv360/index.m3u8\n",
                encoding="utf-8",
            )
            (variant / "index.m3u8").write_text(
                "#EXTM3U\n#EXTINF:4.0,\nmissing.ts\n#EXT-X-ENDLIST\n",
                encoding="utf-8",
            )
            with self.assertRaises(RuntimeError):
                verify_hls_output(root)

    def test_invalid_dimensions_are_rejected(self):
        with self.assertRaises(ValueError):
            build_variant_ladder(0, 1080)


if __name__ == "__main__":
    unittest.main()
