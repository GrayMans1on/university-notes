"""Reproducible, checked patches around the captured CSU canvas renderer."""
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
source = ROOT / 'content/campus-map'
code = (source / 'upstream.js').read_text()
for patch in json.loads((source / 'source.json').read_text())['patches']:
    assert code.count(patch['before']) == 1, 'Upstream changed: review local patch'
    code = code.replace(patch['before'], patch['after'])

start = code.index('function r9(')
end = code.index('function Or(', start)
renderer = code[start:end]


def replace(before, after):
    global renderer
    assert renderer.count(before) == 1, 'Canvas changed: ' + before[:80]
    renderer = renderer.replace(before, after)


replace('function r9({isMapActive:l}){const u=', '''function r9({isMapActive:l}){
const [campusTheme,campusSetTheme]=ft.useState(()=>document.documentElement.dataset.theme),
campusColors=campusMapPalette(campusTheme),campusOffset=campusFloorOffset(jt(vt=>vt.currentMapFloor)),
campusTodayRooms=jt(vt=>vt.todayRoomIds)||[],
[campusSize,campusSetSize]=ft.useState(()=>({width:window.innerWidth,height:window.innerHeight}));
ft.useEffect(()=>{
 const observer=new MutationObserver(()=>campusSetTheme(document.documentElement.dataset.theme));
 observer.observe(document.documentElement,{attributes:true,attributeFilter:["data-theme"]});
 const resize=()=>campusSetSize({width:window.innerWidth,height:window.innerHeight});
 window.addEventListener("resize",resize);
 return()=>{observer.disconnect();window.removeEventListener("resize",resize)};
},[]);
const u=''')
replace('ft.useEffect(()=>{let vt=!0;M(!0)', '''ft.useEffect(()=>{
 window.CampusMapCamera={get:()=>({scale:d,x:o,y:p}),set:view=>{f(view.scale);g(view.x);b(view.y)}};
 window.dispatchEvent(new CustomEvent("campus-camera-ready"));
},[d,o,p]);ft.useEffect(()=>{let vt=!0;M(!0)''')
replace('Oe=Math.max(.3,Math.min(Oe,3))', 'Oe=Math.max(.1,Math.min(Oe,3))')
replace('Kt=Math.max(.4,Math.min(ie,3))', 'Kt=Math.max(.1,Math.min(ie,3))')
replace('window.innerWidth/2-Tt*Lt,ve=u()?window.innerHeight/2-Ht*Lt-125:window.innerHeight/2-Ht*Lt',
        'window.innerWidth/2-(Tt+campusFloorOffset(vt).x)*Lt,ve=window.innerHeight/2-(Ht+campusFloorOffset(vt).y)*Lt')
replace('fill:vt.fill||"transparent",stroke:vt.stroke||"grey"',
        'fill:vt.fill?campusColors.room:"transparent",stroke:campusColors.line')
replace('strokeWidth:vt.strokeWidth||1,opacity:vt.opacity||1',
        'strokeWidth:vt.strokeWidth||1,strokeOpacity:vt.strokeOpacity??1,opacity:vt.opacity||1')
replace('[Ct.decor,z]', '[Ct.decor,z,campusTheme]')
replace('stroke:Tt.stroke||"grey"', 'stroke:campusColors.line')
replace('[Ct.walls,z]', '[Ct.walls,z,campusTheme]')
replace('stroke:vt.stroke,strokeWidth:vt.strokeWidth??1,fill:vt.fill',
        'stroke:campusColors.ink,strokeWidth:vt.materialSymbol?0:vt.strokeWidth??1,fill:campusColors.ink')
replace('[Ct.vectors,z,rt]', '[Ct.vectors,z,rt,campusTheme]')
replace('let Oe="rgba(200, 200, 200, 0.3)",xe="grey",Xe=.5;',
        'let Oe=campusTodayRooms.includes(Tt.id)?campusColors.today:campusColors.room,xe=campusTodayRooms.includes(Tt.id)?campusColors.todayLine:campusColors.line,Xe=.65;')
replace('Oe="rgba(255, 165, 0, 0.7)",xe="darkorange"',
        'Oe=campusColors.selected,xe=campusColors.active')
replace('Oe="rgba(255, 0, 0, 0.4)",xe="darkred"',
        'Oe=campusColors.selected,xe=campusColors.active')
replace('Oe="rgba(180, 180, 255, 0.4)",xe="darkblue"',
        'Oe=campusColors.stair,xe=campusColors.active')
replace('Oe="rgba(210, 210, 210, 0.2)",xe="#bbb"',
        'Oe=campusColors.background,xe=campusColors.line')
replace('Ht&&(xe="#D6322D",Xe=2)', 'Ht&&(xe=campusColors.active,Xe=2)')
replace('id:Tt.id,stroke:xe,strokeWidth:Xe', 'id:Tt.id,stroke:Tt.border_data?"transparent":xe,strokeWidth:Xe')
replace('children:[ye,ns&&k.jsx(Md,{...as}),na&&k.jsx(Md,{...dl})]',
        'children:[ye,Tt.border_data&&k.jsx(B0,{data:Tt.border_data,stroke:xe,strokeWidth:Xe,fill:"transparent",listening:false}),ns&&k.jsx(Md,{...as}),na&&k.jsx(Md,{...dl})]')
replace('fill:"#333"', 'fill:campusColors.ink')
replace('fill:"#555"', 'fill:campusColors.muted')
replace('ae=Kt?"":Tt.name||"",ke=!Kt&&!un&&Q',
        'ae=Kt?"":Tt.map_label??Tt.name??"",ke=!Tt.outdoor&&!Kt&&!un&&Q')
replace('Hu=Math.min(13,$e/3.5,ea/3)', 'Hu=Tt.outdoor?Math.min(28,$e/4,ea/3):Math.min(13,$e/3.5,ea/3)')
renderer = renderer.replace('fontFamily:"\'Nunito\', sans-serif"', 'fontFamily:"Segoe UI, Arial, sans-serif"')
replace('[Ct.rooms,z,C,_,G,H,B,Q,it,ht,nt]', '[Ct.rooms,z,C,_,G,H,B,Q,it,ht,nt,campusTheme,campusTodayRooms]')
replace('height:window.innerHeight,width:window.innerWidth', 'height:campusSize.height,width:campusSize.width')
replace('background:"#F3F3F4"', 'background:campusColors.background')
replace('children:k.jsxs(Xg,{children:[Dt,Wt,ue,Ut,se,k.jsx(u9,{currentFloorIndex:z,mapDataPath:x==="abiturient"?c4:o4})]})',
        'children:k.jsx(Xg,{children:k.jsxs(Fg,{x:campusOffset.x,y:campusOffset.y,children:[Dt,Wt,ue,Ut,se,k.jsx(u9,{currentFloorIndex:z,mapDataPath:x==="abiturient"?c4:o4,campusTheme:campusTheme})]})})')
replace('k.jsx(t9,{room:G,onClose:()=>q(null)})', 'null')
code = code[:start] + renderer + code[end:]
assert code.count('function u9({currentFloorIndex:l,mapDataPath:u})') == 1
code = code.replace('function u9({currentFloorIndex:l,mapDataPath:u})',
                    'function u9({currentFloorIndex:l,mapDataPath:u,campusTheme:campusTheme})')
code = code.replace('stroke:"#D6322D",strokeWidth:3', 'stroke:campusMapPalette(campusTheme).route,strokeWidth:3')
code = code.replace('},[T,l,o]);return d?null:', '},[T,l,o,campusTheme]);return d?null:')
assert code.count('{graph:N,nodeCoords:G}=l9(H)') == 1
code = code.replace('{graph:N,nodeCoords:G}=l9(H)',
                    '{graph:N,nodeCoords:G}=campusBuildGraph(H,_.routing_layers,_.calibration,_.outdoors)')
code += '''\nfunction campusBuildGraph(layers,routingLayers,calibration,outdoors){
 return calibration?projectCampusGraph(l9(routingLayers),calibration,outdoors):l9(layers);
}\n'''
mount = 'G6.createRoot(document.getElementById("root")).render(k.jsx(ft.StrictMode,{children:k.jsx(pv,{})}));'
assert code.count(mount) == 1
code = code.replace(mount, 'G6.createRoot(document.getElementById("root")).render(k.jsx(ft.StrictMode,{children:k.jsx(r9,{isMapActive:true})}));')
code = 'import { campusFloorOffset, campusMapPalette, projectCampusGraph } from "./model.mjs";\n' + code
code += '\n// Stable exports for local map extensions and routing validation.\n'
code += 'export { jt as campusMapStore, campusBuildGraph as buildCampusGraph, Ig as findCampusRoute };\n'
(ROOT / 'assets/campus-map/map.js').write_text(code)
print('Local canvas: theme, floor alignment and camera adapter applied')
