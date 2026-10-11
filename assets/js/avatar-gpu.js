/* One GPU draw interpolates rotation, bidirectional optical motion and the two outfits. */
export function createRenderer(canvas,views,athletic,flowBytes){
  const surface=document.createElement('canvas');surface.width=canvas.width;surface.height=canvas.height;
  if(views.length!==12||athletic.length!==12||flowBytes.length!==48*31*56*4)return null;
  const gl=surface.getContext('webgl',{alpha:true,premultipliedAlpha:false,antialias:false,preserveDrawingBuffer:false});if(!gl)return null;
  const vert='attribute vec2 p;varying vec2 uv;void main(){uv=vec2((p.x+1.0)*.5,(1.0-p.y)*.5);gl_Position=vec4(p,0.,1.);}';
  const frag=`precision mediump float;varying vec2 uv;uniform sampler2D a,b,c,d,fa,fb,fc,fd;uniform float t,outfit,light;uniform vec3 ink;uniform vec2 size;
vec2 flow(sampler2D f,vec2 p){vec2 grid=((p*size-vec2(.5))/8.0+vec2(.5))/vec2(31.0,56.0);return (texture2D(f,grid).rg*255.0-128.0)/3.0/size;}
vec2 correspondence(sampler2D forward,sampler2D backward,vec2 p){vec2 f=flow(forward,p);return .5*(f-flow(backward,p+f));}
float morph(sampler2D x,sampler2D y,sampler2D fx,sampler2D fy){
  // Both drawings sample the same matched surface point, rather than two drifting outlines.
  vec2 qa=uv;for(int i=0;i<6;i++){qa=mix(qa,uv-t*correspondence(fx,fy,qa),.7);}
  vec2 matched=correspondence(fx,fy,qa);
  qa=uv-t*matched;vec2 qb=uv+(1.0-t)*matched;
  vec3 aa=texture2D(x,qa).rgb,bb=texture2D(y,qb).rgb;
  float sa=(aa.b*255.0-128.0)/3.0,sb=(bb.b*255.0-128.0)/3.0;
  float ma=smoothstep(-0.7,0.7,sa),mb=smoothstep(-0.7,0.7,sb);
  // An invisible neighbor cannot change the exact keyframe's contour.
  float wa=(1.0-t)*ma*(1.0-t*smoothstep(2.0,6.0,sb-sa)*(1.0-smoothstep(0.0,3.0,sa)));
  float wb=t*mb*(1.0-(1.0-t)*smoothstep(2.0,6.0,sa-sb)*(1.0-smoothstep(0.0,3.0,sb)));
  float tone=(mix(aa.r,aa.g,light)*wa+mix(bb.r,bb.g,light)*wb)/max(wa+wb,0.001);
  return tone*smoothstep(-0.7,0.7,mix(sa,sb,t));
}
void main(){float value;if(outfit<.001)value=morph(a,b,fa,fb);else if(outfit>.999)value=morph(c,d,fc,fd);else value=mix(morph(a,b,fa,fb),morph(c,d,fc,fd),outfit);gl_FragColor=vec4(ink,value);}`;
  const shader=(kind,text)=>{const s=gl.createShader(kind);gl.shaderSource(s,text);gl.compileShader(s);if(!gl.getShaderParameter(s,gl.COMPILE_STATUS))throw new Error(gl.getShaderInfoLog(s));return s;};
  const program=gl.createProgram();gl.attachShader(program,shader(gl.VERTEX_SHADER,vert));gl.attachShader(program,shader(gl.FRAGMENT_SHADER,frag));gl.linkProgram(program);if(!gl.getProgramParameter(program,gl.LINK_STATUS))return null;gl.useProgram(program);
  const buffer=gl.createBuffer();gl.bindBuffer(gl.ARRAY_BUFFER,buffer);gl.bufferData(gl.ARRAY_BUFFER,new Float32Array([-1,-1,1,-1,-1,1,-1,1,1,-1,1,1]),gl.STATIC_DRAW);const p=gl.getAttribLocation(program,'p');gl.enableVertexAttribArray(p);gl.vertexAttribPointer(p,2,gl.FLOAT,false,0,0);
  function texture(data,w,h){const tex=gl.createTexture();gl.bindTexture(gl.TEXTURE_2D,tex);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,gl.LINEAR);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MAG_FILTER,gl.LINEAR);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_S,gl.CLAMP_TO_EDGE);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_T,gl.CLAMP_TO_EDGE);gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA,w,h,0,gl.RGBA,gl.UNSIGNED_BYTE,data);return tex;}
  function viewTextures(list){return list.map(v=>{const rgba=new Uint8Array(canvas.width*canvas.height*4);for(let i=0;i<v.dark.length;i++){rgba[i*4]=v.dark[i];rgba[i*4+1]=v.light[i];rgba[i*4+2]=v.silhouette[i];rgba[i*4+3]=255;}return texture(rgba,canvas.width,canvas.height);});}
  const clothed=viewTextures(views),bare=viewTextures(athletic),fw=31,fh=56,chunk=fw*fh*4,flows=[];
  for(let i=0;i<48;i++)flows.push(texture(flowBytes.subarray(i*chunk,(i+1)*chunk),fw,fh));
  const names=['a','b','c','d','fa','fb','fc','fd'];names.forEach((n,i)=>gl.uniform1i(gl.getUniformLocation(program,n),i));
  const u=Object.fromEntries(['t','outfit','light','ink','size'].map(n=>[n,gl.getUniformLocation(program,n)]));gl.uniform2f(u.size,canvas.width,canvas.height);gl.viewport(0,0,canvas.width,canvas.height);
  return {draw(index,fraction,amount,isLight,color){const next=(index+1)%12,textures=[clothed[index],clothed[next],bare[index],bare[next],flows[index*2],flows[index*2+1],flows[24+index*2],flows[24+index*2+1]];textures.forEach((tex,i)=>{gl.activeTexture(gl.TEXTURE0+i);gl.bindTexture(gl.TEXTURE_2D,tex);});gl.uniform1f(u.t,fraction);gl.uniform1f(u.outfit,amount);gl.uniform1f(u.light,isLight?1:0);gl.uniform3f(u.ink,...color.map(v=>v/255));gl.drawArrays(gl.TRIANGLES,0,6);return surface;}};
}
