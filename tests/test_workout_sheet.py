"""Exercise sheet invariants: immutable artwork and faithful training values."""
import importlib.util
import unittest
from pathlib import Path

spec = importlib.util.spec_from_file_location('site_build', Path(__file__).resolve().parents[1] / 'scripts/build_site.py')
build = importlib.util.module_from_spec(spec)
spec.loader.exec_module(build)

class WorkoutSheetTests(unittest.TestCase):
    def session(self, sets):
        return {'date': '2026-10-15', 'exercises': [{'name': 'Seated Row', 'sets': sets}]}

    def test_kg_is_converted_to_the_original_lbs_column(self):
        out = build.sheet(self.session([{'weight':80,'units':'kg','reps':12}]*3))
        self.assertEqual(out.count('class="sheet-entry"'), 1)
        self.assertIn('<span>3</span><span>176.4</span><span>12</span>', out)
        self.assertIn('exercise-list-original.png', out)
        self.assertNotIn('<table', out)

    def test_differing_sets_and_order_are_retained(self):
        out = build.sheet(self.session([{'weight':40,'units':'lbs','reps':12},{'weight':50,'units':'lbs','reps':10},{'weight':40,'units':'lbs','reps':12}]))
        self.assertEqual(out.count('class="sheet-entry"'), 3)
        self.assertIn('<span>1</span><span>50</span><span>10</span>', out)

    def test_bodyweight_and_extra_pages(self):
        sets = [{'weight':0,'reps':i} for i in range(11)]
        out = build.sheet(self.session(sets))
        self.assertEqual(out.count('class="training-sheet"'), 2)
        self.assertEqual(out.count('class="sheet-entry"'), 11)
        self.assertIn('B.W.', out)
        self.assertIn('OCT 15, 2026', out)

    def test_original_artwork_is_unchanged(self):
        import hashlib
        data=(build.ROOT/'assets/art/workout/exercise-list-original.png').read_bytes()
        self.assertEqual(hashlib.sha256(data).hexdigest(),'6838b4e690021406d106d33121e227515f4b8f3ec34461e53f70fd46aa55d19d')

if __name__ == '__main__': unittest.main()
