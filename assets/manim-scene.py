# Render with: manim -ql limit-animation.py LimitSolution
# This scene contains data, not user-provided Python expressions.
import json
import textwrap
from manim import Scene, Text, MathTex, FadeIn, FadeOut, TransformMatchingTex, UP, DOWN

DATA = json.loads(__CSU_MANIM_DATA__)


class LimitSolution(Scene):
    def construct(self):
        palette = DATA['palette']
        self.camera.background_color = palette['background']
        heading = Text('Предел с решением', font='DejaVu Sans', font_size=27, color=palette['ink']).to_edge(UP, buff=0.35)
        self.play(FadeIn(heading), run_time=0.4)
        current = None
        explanation = None
        hint = None
        for index, step in enumerate(DATA['chain']):
            formula = MathTex(('=' if index else '') + step['math'], color=palette['ink'], font_size=45)
            if formula.width > 12.5:
                formula.scale_to_fit_width(12.5)
            formula.move_to(UP * 0.3)
            if current is None:
                self.play(FadeIn(formula, shift=UP * 0.15), run_time=0.6)
            else:
                self.play(TransformMatchingTex(current, formula), run_time=0.9)
            current = formula
            if explanation is not None:
                self.play(FadeOut(explanation), run_time=0.15)
            note = step.get('note', 'Исходный предел' if index == 0 else 'Ответ')
            note = '\n'.join(textwrap.wrap(note, 86))
            explanation = Text(note, font='DejaVu Sans', font_size=19, line_spacing=1.2, color=palette['muted'])
            if explanation.width > 12:
                explanation.scale_to_fit_width(12)
            explanation.to_edge(DOWN, buff=0.65)
            self.play(FadeIn(explanation), run_time=0.25)
            if hint is not None:
                self.play(FadeOut(hint), run_time=0.15)
                hint = None
            if step.get('annotation'):
                hint = MathTex(r'\left[' + step['annotation'] + r'\right]', color=palette['accent'], font_size=31)
                hint.next_to(formula, DOWN, buff=0.6)
                self.play(FadeIn(hint), run_time=0.3)
            self.wait(1.4 if index < len(DATA['chain']) - 1 else 2.4)
