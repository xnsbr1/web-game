// Locally drawn industrial field equipment. Coordinates use a 64-unit design grid.
const FieldArt=(()=>{
 const paths=new Map(),ink='#15212b',steel='#84959e',lip='#cfdbd8',iron='#384b56',brass='#ebb961',red='#d75439';
 function sprite(c,x,y,size,paint){
  c.save();c.translate(x,y);c.scale(size/32,size/32);
  const box=(x,y,w,h,color)=>{c.fillStyle=color;c.fillRect(x,y,w,h);};
  const path=(d,fill,stroke,width=2)=>{
   let p=paths.get(d);if(!p){p=new Path2D(d);paths.set(d,p);}
   if(fill){c.fillStyle=fill;c.fill(p);}if(stroke){c.lineWidth=width;c.strokeStyle=stroke;c.stroke(p);}
  };
  const oval=(x,y,rx,ry,color)=>{c.fillStyle=color;c.beginPath();c.ellipse(x,y,rx,ry,0,0,Math.PI*2);c.fill();};
  paint({box,path,oval});
  c.restore();
 }
 function prop(c,kind,x,y,size,on=false,time=0){
  sprite(c,x,y,size,({box,path,oval})=>{
   const lamp=on?'#a5ffd1':'#ffb551';
   oval(2,16,27,8,'#07151a90');
   if(kind==='valve'){
    path('M-30 9H-11L-6 4H8L14 10H30V22H11L5 17H-5L-10 22H-30Z',steel,ink);
    for(const a of [-24,20]){box(a,6,5,19,iron);box(a,7,2,15,lip);}
    box(-5,-7,10,21,brass);oval(0,-7,19,18,ink);oval(0,-9,18,17,red);oval(0,-9,12,11,iron);
    c.save();c.translate(0,-9);c.rotate(on?time*2:.22);
    for(let i=0;i<5;i++){c.rotate(Math.PI*2/5);box(-2,-14,4,15,red);}c.restore();
    oval(0,-9,4,4,brass);path('M-14 -15Q-9 -25 3 -24',null,'#ffb89a',2);
   }else if(kind==='door'){
    path('M-26 22V-20L-18 -28H18L26 -20V22Z',iron,ink,3);
    box(-20,-18,40,36,ink);const opening=on?13:1;
    for(const side of [-1,1]){c.save();c.scale(side,1);box(opening,-17,20-opening,34,steel);box(opening,2,20-opening,5,brass);box(19,-19,4,40,lip);c.restore();}
    box(-17,-25,34,4,ink);box(-6,-24,12,2,lamp);box(-29,20,58,5,steel);
   }else if(kind==='signal'||kind==='switch'){
    path('M-15 19L6 13L20 21L-6 27Z',steel,ink);box(-5,-14,7,34,iron);box(-4,-12,2,32,lip);
    if(kind==='signal'){path('M-15 -28H9L14 -23V1L8 6H-14Z',iron,ink);for(const [i,k] of [[-19,on?iron:red],[-5,on?lamp:brass]]){oval(-1,i,7,7,ink);oval(-2,i-1,4,4,k);}}
    else{path('M-22 11L-4 4L14 10L-4 19Z',brass,ink);path(on?'M-5 12L13 -15':'M-5 12L-19 -14',null,lip,5);oval(on?13:-19,-15,6,5,red);}
   }else if(kind==='power'||kind==='ward'||kind==='mag'){
    path('M-23 15V-14L-15 -22H14L23 -15V15L12 22H-12Z',iron,ink,3);
    if(kind==='power'){for(const a of [-12,0,12]){box(a-4,-18,8,27,brass);for(let j=-14;j<9;j+=5)box(a-5,j,10,2,iron);}path('M-12 -19Q0 -34 12 -19',null,lip);}
    else if(kind==='mag'){path('M-14 -14V3Q0 24 14 3V-14',null,red,8);box(-18,-16,8,6,lip);box(10,-16,8,6,lip);}
    else{path('M0 -20L15 -11L11 4L0 16L-11 4L-15 -11Z','#66c6be',lip);path('M0 -15V9',null,lip);}
    box(-12,13,24,3,lamp);
   }else if(kind==='vent'){
    path('M-25 -14L-15 -23H16L25 -14V16L15 23H-16L-25 14Z',steel,ink,3);oval(0,0,19,19,iron);
    c.save();c.rotate(time*2);for(let i=0;i<5;i++){c.rotate(Math.PI*2/5);path('M1 -3Q3 -17 16 -10L13 -2Q7 3 1 -3Z','#8ed8cd');}c.restore();oval(0,0,5,5,brass);
   }else if(kind==='med'){
    path('M-9 -13V-22H9V-13',null,steel,4);path('M-24 -14H22L25 -8V17H-23Z','#e1ded0',ink,3);box(-24,9,48,7,'#798b80');box(-3,-10,7,17,red);box(-9,-5,19,7,red);
   }else if(kind==='cart'){
    for(const a of [-15,15]){oval(a,15,7,7,ink);oval(a,15,3,3,steel);}
    path('M-27 -13L-17 12H18L27 -13Z','#a26748',ink,3);path('M-23 -13L-10 -24L-2 -20L6 -25L20 -14Z','#475963',ink);box(-27,-13,54,4,brass);box(-16,4,32,3,'#e0a772');
   }else{
    path('M-17 -16Q0 -24 17 -16V16Q0 24 -17 16Z','#ad5540',ink);oval(0,-16,17,5,brass);box(-18,-7,36,4,iron);box(-18,9,36,4,iron);box(1,-18,6,3,ink);
   }
  });
 }
 function pilot(c,x,y,size,direction,role,tint,gun){
  sprite(c,x,y,size,({path,box,oval})=>{
   c.rotate(direction);
   path('M-14 -14L-25 -12L-23 13L-13 17L3 11L7 -8Z',iron,ink,3);
   if(role==='hunter'||role==='leech')path('M-4 -17L-28 -11L-19 -4L-28 9L-6 17Z',tint,ink);
   for(const side of [-1,1]){c.save();c.scale(1,side);oval(-2,13,10,7,tint);box(5,10,11,6,iron);c.restore();}
   const length={pistol:17,revolver:20,rifle:31,rail:35,shotgun:26,sniper:38,smg:22}[gun]||25;
   box(8,3,length,7,ink);box(12,3,length-6,3,steel);box(10,8,10,4,brass);
   if(role==='bulwark')path('M-12 -21L12 -21L20 -12L12 -7L-10 -11Z','#788faa',lip);
   if(role==='tech'||role==='ranger')path('M-12 -10L-22 -23',null,lip,2);
   if(role==='gunner')for(const a of [-9,-4,1])box(a,13,3,7,brass);
   if(role==='runner')path('M-20 10L-32 16L-19 2Z',brass);
   path('M-13 -8L-5 -15L8 -13L15 -6L14 7L5 12L-10 10Z',steel,ink,3);
   path('M5 -11L13 -7L13 6L7 9L6 1Z',tint,ink);
   if(role==='medic'){box(-8,-3,10,3,red);box(-5,-6,3,9,red);}
  });
 }
 return {prop,pilot};
})();
