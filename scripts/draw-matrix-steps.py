"""Draw the recorded matrix operations, with notebook-style pivots and arrows.

The registry is the sole source for these diagrams, the notes and the widgets.
Run prepare-diagrams.py afterwards to outline the glyphs and apply both themes.
"""
from fractions import Fraction
from html import escape
from pathlib import Path
import json

ROOT = Path(__file__).resolve().parents[1]
INK, BLUE, GREEN, MUTED = '#36465e', '#254cce', '#168276', '#42536c'
SUB = str.maketrans('0123456789', '₀₁₂₃₄₅₆₇₈₉')


def label(value):
    return str(value).replace('-', '−')


def draw(key, number, sequence, before, step):
    after = step['after']
    operations = step['operations']
    rows, columns = len(before), len(before[0])
    column_ops = any(o['kind']=='add-column' for o in operations)
    arrows = [o for o in operations if o['kind']=='add']
    gutter = max(130, len(arrows)*95) if not column_ops else 30
    left, gap, row_gap = 48, 65, 61
    right = left + columns*gap + 4
    width = max(360, right + gutter + 22)
    top = 42
    before_bottom = top + rows*row_gap
    column_gutter = 82*sum(o['kind']=='add-column' for o in operations) if column_ops else 0
    after_top = before_bottom + column_gutter + 85
    height = after_top + len(after)*row_gap + 25
    title = f"{sequence['title']}: переход {number}"
    parts=[f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {width} {height}" role="img" aria-labelledby="title" data-matrix-key="{key}" data-matrix-step="{number}">',
           f'<title id="title">{escape(title)}</title>']

    def text(x,y,value,size=20,color=INK,anchor='middle'):
        parts.append(f'<text x="{x}" y="{y}" font-size="{size}" fill="{color}" text-anchor="{anchor}">{escape(str(value))}</text>')

    def path(d,color=INK,stroke=1.8,klass=''):
        parts.append(f'<path d="{d}" stroke="{color}" stroke-width="{stroke}" fill="none"'+(f' class="{klass}"' if klass else '')+'/>')

    def row_y(i, matrix_top=top):
        return matrix_top+(i-.5)*row_gap

    def col_x(j):
        return left+(j-.5)*gap

    def arrow(d,x,y,direction='left',color=BLUE):
        path(d,color,2,'matrix-addition-arrow')
        if direction=='left':head=f'M{x+7} {y-5}L{x} {y}L{x+7} {y+5}'
        elif direction=='up':head=f'M{x-5} {y+7}L{x} {y}L{x+5} {y+7}'
        else:head=f'M{x-5} {y-7}L{x} {y}L{x+5} {y-7}'
        path(head,color,2,'matrix-addition-arrowhead')

    def matrix(data,matrix_top,heading):
        text(left,matrix_top-15,heading,14,MUTED,'start')
        bottom=matrix_top+len(data)*row_gap
        matrix_right=left+len(data[0])*gap+4
        if sequence['determinant']:
            path(f'M{left-5} {matrix_top+4}V{bottom-4}')
            path(f'M{matrix_right} {matrix_top+4}V{bottom-4}')
        else:
            path(f'M{left+2} {matrix_top+4}Q{left-12} {(matrix_top+bottom)/2} {left+2} {bottom-4}')
            path(f'M{matrix_right-5} {matrix_top+4}Q{matrix_right+9} {(matrix_top+bottom)/2} {matrix_right-5} {bottom-4}')
        split=sequence['split']
        if split is not None:
            path(f'M{left+split*gap} {matrix_top+6}V{bottom-6}',MUTED,1)
        for i,row in enumerate(data,1):
            y=row_y(i,matrix_top)
            text(18,y+4,'R'+str(i).translate(SUB),12,MUTED)
            for j,item in enumerate(row,1):
                x=col_x(j)
                f=Fraction(item)
                if f.denominator==1:
                    text(x,y+7,label(f.numerator))
                else:
                    sign='−' if f<0 else ''
                    text(x,y-6,sign+str(abs(f.numerator)),16)
                    path(f'M{x-20} {y}H{x+20}',INK,1.1)
                    text(x,y+18,f.denominator,16)

    matrix(before,top,'До преобразования')
    pivots={tuple(o['pivot']) for o in operations if 'pivot' in o}
    for i,j in sorted(pivots):
        radius=25 if '/' in before[i-1][j-1] else 21
        parts.append(f'<circle class="matrix-pivot" cx="{col_x(j)}" cy="{row_y(i)}" r="{radius}" fill="none" stroke="{BLUE}" stroke-width="2"/>')
    lane=0
    for op in operations:
        kind=op['kind']
        if kind=='add':
            sy,ty=row_y(op['source']),row_y(op['target'])
            x=right+38+95*lane
            text(x,sy+5,'×('+label(op['factor'])+')',16,BLUE)
            turn=x+36
            arrow(f'M{turn} {sy}Q{turn+12} {(sy+ty)/2} {turn} {ty}H{right+14}',right+14,ty)
            text(right+11,ty-10,'+',14,BLUE)
            lane+=1
        elif kind=='scale':
            text(right+52,row_y(op['row'])+5,'×('+label(op['factor'])+')',17,BLUE)
        elif kind=='add-column':
            index=sum(o['kind']=='add-column' for o in operations[:operations.index(op)])
            y=before_bottom+35+82*index
            sx,tx=col_x(op['source']),col_x(op['target'])
            text(sx,y,'×('+label(op['factor'])+')',16,BLUE)
            ay=y+23
            arrow(f'M{sx} {y+7}V{ay}Q{(sx+tx)/2} {ay+8} {tx} {ay}V{before_bottom+12}',tx,before_bottom+12,'up')
            text(tx+10,before_bottom+15,'+',14,BLUE)
        elif kind=='drop':
            y=row_y(op['row']);path(f'M{left+3} {y}H{right-7}',MUTED,1.5,'matrix-deleted-row')
        elif kind=='swap':
            sy,ty=[row_y(i) for i in op['rows']]
            x=right+55
            path(f'M{right+14} {sy}Q{x+20} {sy} {x} {(sy+ty)/2}Q{x+20} {ty} {right+14} {ty}',BLUE,2,'matrix-swap-arrow')
            path(f'M{right+21} {sy-5}L{right+14} {sy}L{right+21} {sy+5}',BLUE,2)
            path(f'M{right+21} {ty-5}L{right+14} {ty}L{right+21} {ty+5}',BLUE,2)
            text(right+95,(sy+ty)/2+5,'↔',18,BLUE)
        elif kind=='reorder':
            for new,old in enumerate(op['order'],1):text(right+60,row_y(old)+5,'R'+str(new).translate(SUB),16,BLUE)
        elif kind=='minor':
            y=row_y(op['row']);x=col_x(op['column'])
            path(f'M{left+3} {y}H{right-7}',MUTED,1.2,'matrix-minor-removed')
            path(f'M{x} {top+5}V{before_bottom-5}',MUTED,1.2,'matrix-minor-removed')
    text(left+columns*gap/2,after_top-44,'=' if sequence['determinant'] else '∼',26,MUTED)
    matrix(after,after_top,'После преобразования')
    parts.append('</svg>')
    (ROOT/'assets'/f'matrix-step-{key}-{number}.svg').write_text('\n'.join(parts)+'\n')


data=json.loads((ROOT/'content/matrix-steps.json').read_text())
count=0
for key,sequence in data.items():
    before=sequence['initial']
    for number,step in enumerate(sequence['steps'],1):
        draw(key,number,sequence,before,step)
        before=step['after'];count+=1
print(json.dumps({'matrix_examples':len(data),'matrix_diagrams':count}))
