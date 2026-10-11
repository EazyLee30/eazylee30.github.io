/* Signed contour distances provide one silhouette between two illustration views. */
export function silhouetteDistance(alpha,width,height){
  const count=width*height,inside=new Float32Array(count),outside=new Float32Array(count),diagonal=Math.SQRT2;
  for(let i=0;i<count;i++){const solid=alpha[i]>32;inside[i]=solid?10000:0;outside[i]=solid?0:10000;}
  function sweep(d){
    for(let y=0;y<height;y++)for(let x=0;x<width;x++){
      const i=y*width+x;let v=d[i];if(x)v=Math.min(v,d[i-1]+1);if(y){v=Math.min(v,d[i-width]+1);if(x)v=Math.min(v,d[i-width-1]+diagonal);if(x+1<width)v=Math.min(v,d[i-width+1]+diagonal);}d[i]=v;
    }
    for(let y=height-1;y>=0;y--)for(let x=width-1;x>=0;x--){
      const i=y*width+x;let v=d[i];if(x+1<width)v=Math.min(v,d[i+1]+1);if(y+1<height){v=Math.min(v,d[i+width]+1);if(x)v=Math.min(v,d[i+width-1]+diagonal);if(x+1<width)v=Math.min(v,d[i+width+1]+diagonal);}d[i]=v;
    }
  }
  sweep(inside);sweep(outside);const result=new Uint8Array(count);
  for(let i=0;i<count;i++)result[i]=Math.max(0,Math.min(255,Math.round(128+(inside[i]-outside[i])*3)));
  return result;
}
