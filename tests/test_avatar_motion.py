"""Check optical motion direction and the shipped GPU metadata layout."""
import importlib.util
from pathlib import Path
import unittest

ROOT = Path(__file__).resolve().parents[1]
try:
    import numpy as np
    spec = importlib.util.spec_from_file_location('avatar_motion', ROOT/'scripts/build_avatar_motion.py')
    motion = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(motion)
except ImportError:
    np = None


class MotionAssetTests(unittest.TestCase):
    def test_shipped_fields_have_complete_texture_data(self):
        data = (ROOT/'assets/data/avatar-flow.bin').read_bytes()
        self.assertEqual(len(data), 48*31*56*4)
        self.assertTrue(all(alpha == 255 for alpha in data[3::4]))

    @unittest.skipIf(np is None, 'Optional atlas authoring dependencies are unavailable')
    def test_bidirectional_fields_follow_translated_contours(self):
        a = np.random.default_rng(42).uniform(0, 255, (440, 240, 2))
        b = np.zeros_like(a)
        b[4:, 8:] = a[:-4, :-8]
        forward = np.frombuffer(motion.pair_flow(a, b), dtype=np.uint8).reshape(56, 31, 4)
        backward = np.frombuffer(motion.pair_flow(b, a), dtype=np.uint8).reshape(56, 31, 4)
        forward = (forward[5:49, 5:25, :2].astype(float)-128)/3
        backward = (backward[5:49, 5:25, :2].astype(float)-128)/3
        self.assertLess(np.max(np.abs(np.median(forward, axis=(0,1))-[8, 4])), .5)
        self.assertLess(np.max(np.abs(np.median(backward, axis=(0,1))-[-8, -4])), .5)


if __name__ == '__main__':
    unittest.main()
