"""Exercise sheet invariants: immutable artwork, faithful training values, and movement art resolution."""
import importlib.util
import json
import re
import subprocess
import unittest
from pathlib import Path

spec = importlib.util.spec_from_file_location('site_build', Path(__file__).resolve().parents[1] / 'scripts/build_site.py')
build = importlib.util.module_from_spec(spec)
spec.loader.exec_module(build)


class WorkoutSheetTests(unittest.TestCase):
    def session(self, sets, name='Seated Row'):
        return {'date': '2026-10-15', 'exercises': [{'name': name, 'sets': sets}]}

    def test_kg_is_converted_to_the_original_lbs_column(self):
        out = build.sheet(self.session([{'weight': 80, 'units': 'kg', 'reps': 12}] * 3))
        self.assertEqual(out.count('class="sheet-entry"'), 1)
        self.assertIn('<span>3</span><span>176.4</span><span>12</span>', out)
        self.assertIn('exercise-list-original.png', out)
        self.assertNotIn('<table', out)

    def test_long_exercise_names_scale_down_for_sheet_boxes(self):
        short = build.sheet(self.session([{'weight': 80, 'units': 'kg', 'reps': 12}], name='Pull Up'))
        long_ = build.sheet(self.session([{'weight': 45, 'units': 'kg', 'reps': 10}], name='Bench Press - Wide Grip - Barbell'))
        self.assertIn('font-size:3.25cqw', short)
        match = re.search(r'font-size:([0-9.]+)cqw', long_)
        self.assertIsNotNone(match)
        self.assertLess(float(match.group(1)), 2.5)

    def test_differing_sets_and_order_are_retained(self):
        out = build.sheet(self.session([{'weight': 40, 'units': 'lbs', 'reps': 12}, {'weight': 50, 'units': 'lbs', 'reps': 10}, {'weight': 40, 'units': 'lbs', 'reps': 12}]))
        self.assertEqual(out.count('class="sheet-entry"'), 3)
        self.assertIn('<span>1</span><span>50</span><span>10</span>', out)

    def test_bodyweight_and_extra_pages(self):
        sets = [{'weight': 0, 'reps': i} for i in range(11)]
        out = build.sheet(self.session(sets))
        self.assertEqual(out.count('class="training-sheet"'), 2)
        self.assertEqual(out.count('class="sheet-entry"'), 11)
        self.assertIn('B.W.', out)
        self.assertIn('OCT 15, 2026', out)

    def test_original_artwork_is_unchanged(self):
        import hashlib
        data = (build.ROOT / 'assets/art/workout/exercise-list-original.png').read_bytes()
        self.assertEqual(hashlib.sha256(data).hexdigest(), '6838b4e690021406d106d33121e227515f4b8f3ec34461e53f70fd46aa55d19d')

    def test_bundled_guide_svgs_match_local_list(self):
        art_js = (build.ROOT / 'assets/js/workout-art.js').read_text()
        block = re.search(r'LOCAL_SLUGS\s*=\s*new Set\(\[(.*?)\]\)', art_js, re.S)
        self.assertIsNotNone(block)
        slugs = re.findall(r"'([a-z0-9-]+)'", block.group(1))
        self.assertGreaterEqual(len(slugs), 6)
        guide = build.ROOT / 'assets/art/workout/guide'
        for slug in slugs:
            for n in (1, 2, 3):
                frame = guide / slug / f'frame-{n}.svg'
                self.assertTrue(frame.exists(), f'Missing {frame}')
                self.assertIn('<svg', frame.read_text())

    def test_live_exercise_art_resolution(self):
        live_js = build.ROOT / 'assets/js/workout-live.js'
        cases = [
            ({'id': 'WIDEGRIPBENCHPRESS_BARBELL', 'name': 'Bench Press - Wide Grip - Barbell'}, 'bench-press'),
            ({'id': 'BENCHPRESS_PULLEYMACHINE', 'name': 'Machine Chest Press'}, 'machine-chest-press'),
            ({'id': 'OVERHANDGRIPPULLUPS', 'name': 'Pull Up'}, 'pull-up'),
            ({'id': 'SEATEDROW_PULLEYMACHINE', 'name': 'Seated Row'}, 'seated-row'),
            ({'id': 'LATPULLDOWNFRONT_PULLEYMACHINE', 'name': 'Lat Pull Down - Front'}, 'lat-pulldown'),
            ({'id': 'NARROWGRIPLATPULLDOWNFRONT_PULLEYMACHINE', 'name': 'Lat Pull Down - Narrow Grip'}, 'close-grip-lat-pulldown'),
            ({'id': 'INCLINEBENCHPRESS_DUMBBELL', 'name': 'Bench Press - Incline - Dumbbell'}, 'incline-dumbbell-press'),
            ({'id': 'INCLINEBENCHPRESS_BARBELL', 'name': 'Bench Press - Incline - Barbell'}, 'incline-bench-press'),
            ({'id': 'BENCHPRESS_DUMBBELL', 'name': 'Bench Press - Dumbbell'}, 'dumbbell-bench-press'),
            ({'id': 'CHESTFLY_MACHINE', 'name': 'Pec Deck'}, 'pec-deck'),
            ({'id': 'CHESTFLY_CABLE', 'name': 'Cable Chest Fly'}, 'cable-fly'),
            ({'id': 'REARDELTFLY_MACHINE', 'name': 'Rear Delt Fly - Machine'}, 'reverse-pec-deck'),
            ({'id': 'BACKSQUAT_BARBELL', 'name': 'Back Squat - Barbell'}, 'squat'),
            ({'id': 'ROMANIANDEADLIFT_BARBELL', 'name': 'Romanian Deadlift - Barbell'}, 'romanian-deadlift'),
            ({'id': 'LEGPRESS_MACHINE', 'name': 'Leg Press'}, 'leg-press'),
            ({'id': 'LEGEXTENSION_MACHINE', 'name': 'Leg Extension'}, 'leg-extension'),
            ({'id': 'SEATEDLEGCURL_MACHINE', 'name': 'Seated Leg Curl'}, 'seated-leg-curl'),
            ({'id': 'HAMMERCURL_DUMBBELL', 'name': 'Hammer Curl - Dumbbell'}, 'hammer-curl'),
            ({'id': 'TRICEPPUSHDOWN_CABLE', 'name': 'Tricep Pushdown - Cable'}, 'tricep-pushdown'),
            ({'id': 'CUSTOM_UNKNOWN_DRILL', 'name': 'Totally Custom Stretch Drill'}, None),
        ]
        script = f"""
        globalThis.document = {{ querySelector: () => null }};
        globalThis.location = {{ search: '' }};
        const fs = require('fs');
        eval(fs.readFileSync({json.dumps(str(live_js))}, 'utf8'));
        const cases = {json.dumps([c[0] for c in cases])};
        console.log(JSON.stringify(cases.map(c => globalThis.__workoutResolveArt(c))));
        """
        raw = subprocess.check_output(['node', '-e', script], text=True)
        actual = json.loads(raw)
        for (inp, expected), got in zip(cases, actual):
            self.assertEqual(got, expected, f'Mismatch for {inp}: got {got}, expected {expected}')


if __name__ == '__main__':
    unittest.main()
