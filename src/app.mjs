import { measurePhoto, recommendSize, parseCatalogCsv, requiredFieldsFor } from './engine.mjs';
import { summarizeRepeated, evaluateFit, ellipseCircumference } from './fit.mjs';
import { BODY_LANDMARKS, POSE_CONNECTIONS, mapPoseToPhoto } from './landmarks.mjs';
import { CATALOGS, SOURCES } from './catalogs.mjs';

const $ = id => document.getElementById(id);
const canvas = $('canvas'), ctx = canvas.getContext('2d'), video = $('video'), overlay = $('liveOverlay'), overlayCtx = overlay.getContext('2d');
const state = { garment: 'shirt', step: 1, view: 'front', photos: {}, measurements: {}, catalogId: 'eci-nino', customCatalogs: [], demo: false, repeats: {}, ease: {} };
let stream = null, cameraToken = 0, imageToken = 0, assistant = null, assistToken = 0, pose = null, poseAt = 0, poseExpiry = null, assistLoading = false, dragging = false, pointerMoved = false, activePoint = 'top', dragKey = null, activeAiPoint = 11, recognitionController = null, recognitionRun = 0, assistantController = null;
const GARMENT_DATA = {
 shirt: { name: 'Camisa', description: 'Pecho, hombros y manga', needed: 'Contorno de pecho. Revisa además cuello, manga y largo según el modelo.', icon: '<path d="m22 13-13 8 9 15 8-5v31h30V31l8 5 9-15-13-8-11-3-7 9-7-9-13 3Z"/><path d="m35 10 7 9-8 7-8-13m23-3-7 9 8 7 8-13M42 24v38"/>' },
 pants: { name: 'Pantalón', description: 'Cintura, cadera y pierna', needed: 'Contornos de cintura y cadera. Verifica entrepierna y largo por separado.', icon: '<path d="M22 10h40l5 54H48l-6-32-6 32H17l5-54Z"/><path d="M21 20h42M42 11v21m-18-11-4 11m39-11 4 11"/>' },
 skirt: { name: 'Falda', description: 'Cintura, cadera y largo', needed: 'Contornos de cintura y cadera. El largo depende del modelo y del reglamento del colegio.', icon: '<path d="M25 11h34l13 51c-20 8-40 8-60 0l13-51Z"/><path d="M24 21h36M33 24l-6 40m24-40 6 40M42 24v42"/>' },
 shoes: { name: 'Zapatos', description: 'Ambos pies, largo y ancho', needed: 'Longitud de ambos pies con regla. Se compara el mayor y se revisa el ancho al probar el calzado.', icon: '<path d="M13 36c12 0 16-8 18-18l16 7 4 15 15 5c9 3 11 9 9 15H10V43c0-5 0-7 3-7Z"/><path d="M10 52h64M37 30l10 3m-7 3 10 3m-8 3 11 3"/>' }
};
const POINTS = {
 top: ['Cabeza', 'Marca la parte superior real de la cabeza; evita contar cabello voluminoso.'],
 bottom: ['Suelo', 'Marca el suelo a nivel de las plantas, centrado entre los pies.'],
 chestL: ['Pecho · borde izquierdo', 'Marca el borde del pecho al nivel más prominente, separado del brazo.'],
 chestR: ['Pecho · borde derecho', 'Marca el borde opuesto al mismo nivel del pecho.'],
 chestFront: ['Pecho · borde delantero', 'En perfil, marca el borde delantero al mismo nivel anatómico que en la foto frontal.'],
 chestBack: ['Pecho · borde de espalda', 'Marca el borde posterior del pecho a ese mismo nivel.'],
 shoulderL: ['Hombro izquierdo de la imagen', 'Marca el extremo del hombro a tu izquierda en la foto.'],
 shoulderR: ['Hombro derecho de la imagen', 'Marca el extremo del hombro a tu derecha, al mismo nivel que el otro.'],
 waistL: ['Cintura izquierda de la imagen', 'Marca el borde de la cintura natural a tu izquierda.'],
 waistR: ['Cintura derecha de la imagen', 'Marca el borde opuesto de la cintura, al mismo nivel.'],
 hipL: ['Cadera izquierda de la imagen', 'Marca el borde exterior de la zona más ancha de la cadera, a tu izquierda.'],
 hipR: ['Cadera derecha de la imagen', 'Marca el borde opuesto de la cadera al mismo nivel.'],
 elbow: ['Codo del brazo derecho de la imagen', 'Marca el codo del mismo brazo que el hombro derecho de la imagen.'],
 wrist: ['Muñeca del brazo derecho de la imagen', 'Marca la muñeca de ese brazo. Revisa su posición antes de calcular la manga.'],
 crotch: ['Inicio de la entrepierna', 'Con la persona vestida, marca el inicio visible de la entrepierna del pantalón; si no se distingue, no estimes esta medida.'],
 waistFront: ['Cintura · borde delantero', 'En la vista lateral, marca la parte delantera de la cintura.'],
 waistBack: ['Cintura · borde de espalda', 'Marca la parte posterior de la cintura al mismo nivel.'],
 hipFront: ['Cadera · borde delantero', 'Marca el borde delantero de la cadera en la vista lateral.'],
 hipBack: ['Cadera · borde de espalda', 'Marca el borde posterior de la cadera al mismo nivel.'],
 refA: ['Referencia · primer extremo', 'Marca un extremo del segmento físico cuya longitud comprobaste con regla.'],
 refB: ['Referencia · segundo extremo', 'Marca el otro extremo de esa referencia, sobre el mismo plano del pie.'],
 heel: ['Talón', 'Marca la parte más posterior del talón, con el pie apoyado.'],
 toe: ['Dedo más largo', 'Marca el extremo del dedo más largo, que no siempre es el dedo gordo.'],
 footL: ['Ancho del pie · borde izquierdo', 'Marca el borde izquierdo de la parte más ancha del pie.'],
 footR: ['Ancho del pie · borde derecho', 'Marca el borde derecho de esa misma zona.']
};
const FIELDS = {
 chest: ['Contorno de pecho', 'Rodea la parte más prominente con cinta horizontal.'],
 waist: ['Contorno de cintura', 'Rodea la cintura natural sin apretar.'],
 hip: ['Contorno de cadera', 'Rodea la parte más ancha de cadera y glúteos.'],
 inseam: ['Entrepierna (opcional)', 'Desde la entrepierna hasta el largo deseado; revisa el modelo.'],
 sleeve: ['Manga (opcional)', 'Del hombro a la muñeca siguiendo el brazo.'],
 skirtLength: ['Largo de falda (opcional)', 'De cintura a la altura requerida por el colegio.'],
 leftFoot: ['Largo del pie izquierdo', 'Con peso apoyado, del talón al dedo más largo.'],
 rightFoot: ['Largo del pie derecho', 'Mide también este pie y confirma el ancho al probar.']
};
const format = value => Number(value).toLocaleString('es-GT', { maximumFractionDigits: 1 });
const node = (tag, text, className) => { const element = document.createElement(tag); if (text !== undefined) element.textContent = text; if (className) element.className = className; return element; };
const currentPhoto = () => state.photos[state.view];
const isFoot = () => state.garment === 'shoes';
const views = () => isFoot() ? [['leftFoot','Pie izquierdo'],['rightFoot','Pie derecho']] : [['front','Frontal'],['side','Perfil · comparación']];
function pointKeys(view=state.view) {
 if (isFoot()) return ['refA','refB','heel','toe','footL','footR'];
 if (view === 'side') return ['top','bottom',...(state.garment==='shirt'?['chestFront','chestBack']:[]),'waistFront','waistBack',...(state.garment==='shirt'?[]:['hipFront','hipBack'])];
 if (state.garment === 'shirt') return ['top','bottom','shoulderL','shoulderR','chestL','chestR','waistL','waistR','elbow','wrist'];
 return ['top','bottom','waistL','waistR','hipL','hipR', ...(state.garment === 'pants' ? ['crotch'] : [])];
}
function status(text, error = false) { $('cameraStatus').textContent = text; $('cameraStatus').classList.toggle('error', error); }
function announce(text) { $('globalStatus').textContent = text; }
function selectStep(step, focus = true) {
 if (step !== 3) { imageToken++; stopCamera(); }
 state.step = Math.max(1, Math.min(5, step));
 for (let i=1;i<=5;i++) $('step'+i).hidden = i !== state.step;
 for (const button of $('steps').children) { if (Number(button.dataset.step) === state.step) button.setAttribute('aria-current','step'); else button.removeAttribute('aria-current'); }
 if (state.step === 3) renderCapture();
 if (state.step === 4) { renderMeasureFields(); renderCatalogs(); }
 if (state.step === 5) renderRecommendation();
 if (focus) { const heading=$('title'+state.step); heading.focus({preventScroll:true}); $('steps').scrollIntoView({block:'start',behavior:'instant'}); }
}
function setGarment(garment) {
 if (!GARMENT_DATA[garment]) return;
 stopCamera(); imageToken++; state.garment=garment; state.view=isFoot()?'leftFoot':'front'; activePoint=pointKeys()[0];
 $('confirmed').checked=false; $('referenceAccepted').checked=false;
 state.catalogId=isFoot()?'clarks-kids':garment==='skirt'?'eci-nina':'eci-nino';
 for (const button of $('garments').children) button.setAttribute('aria-pressed', String(button.dataset.garment===garment));
 renderPreparation(); renderMeasureFields(); renderCatalogs(); renderCapture();
 announce(`${GARMENT_DATA[garment].name} seleccionada.`);
}
function renderPreparation() {
 $('selectedGarment').textContent=GARMENT_DATA[state.garment].name; $('neededMeasures').textContent=GARMENT_DATA[state.garment].needed;
 $('bodyCalibration').hidden=isFoot();$('footCalibration').hidden=!isFoot();
 $('prepSubtitle').textContent=isFoot()?'Una captura independiente para cada pie, con referencia física comprobada.':'La estatura sirve de escala; una persona adulta puede ayudarte a encuadrar.';
 const instructions=isFoot()?['Mide ambos pies descalzos y con el peso repartido. Utiliza el pie de mayor longitud.','Apoya el pie sobre un suelo plano, junto a una referencia medida con regla; evita que el pie la tape.','Fotografía desde arriba y perpendicular al suelo. La inclinación de la cámara introduce errores.','Comprueba la longitud con regla y el ancho al probar ambos zapatos.']:['Usa ropa ajustada, sin zapatos. No es necesario mostrar detalles del rostro.','Coloca la cámara recta a media altura del cuerpo y evita el gran angular. Usa ayuda de otra persona.','Incluye cabeza y plantas de los pies; separa ligeramente los brazos.','Para menores, cuenta con la autorización de su responsable. Repite si hay movimiento o mala luz.'];
 $('prepList').replaceChildren(...instructions.map(text=>node('li',text)));
}
function renderViews() {
 $('viewTabs').replaceChildren(...views().map(([key,label])=>{const button=node('button',label);button.setAttribute('aria-pressed',String(key===state.view));button.addEventListener('click',()=>{stopCamera();imageToken++;state.view=key;activePoint=pointKeys()[0];renderCapture();});return button;}));
 $('assistButton').disabled=isFoot()||state.view!=='front';
 if(isFoot()) $('assistStatus').textContent='Para pies se usa referencia física y revisión manual; el detector corporal no mide calzado.';
 else if(state.view==='side') $('assistStatus').textContent='La asistencia de postura está disponible en la vista frontal. Revisa la lateral manualmente.';
 else if(!assistant) $('assistStatus').textContent='IA local · Google MediaPipe Pose. La primera carga necesita conexión; las fotos se procesan aquí.';
 $('empty').querySelector('h3').textContent=isFoot()?'Encuadra el pie y la referencia':'La guía está lista';
}
function renderCapture() {
 renderViews(); const photo=currentPhoto();
 $('captureSubtitle').textContent=isFoot()?'Captura cada pie desde arriba junto al segmento de referencia. Comprueba la medida con regla.':'La silueta orienta el encuadre. Ajusta su ancho como ayuda visual; no define el cuerpo de una talla.';
 $('empty').hidden=!!photo||!!stream; canvas.hidden=!photo||!!stream; video.hidden=!stream; overlay.hidden=!stream;
 $('captureAction').hidden=!stream;$('stopCamera').hidden=!stream;
 $('captureMode').textContent=stream?'CÁMARA EN VIVO':photo?(photo.demo?'EJEMPLO FICTICIO':'FOTO · REVISIÓN DE PUNTOS'):'SIN CAPTURA';
 if(photo&&!stream){canvas.width=photo.source.width;canvas.height=photo.source.height;}
 renderPointControls();renderRecognition();drawPhoto();renderPhotoResults();
}
function renderPointControls() {
 const photo=currentPhoto(), keys=pointKeys(); if(!keys.includes(activePoint))activePoint=keys[0];
 $('pointToolbar').hidden=!photo||!!stream;
 $('photoPoint').replaceChildren(...keys.map((key,index)=>{const origin=photo?.origins?.[key]||'';const option=node('option',`${photo?.points[key]?'✓ ':''}${index+1}. ${POINTS[key][0]}${origin==='ai'?' · IA, revisar':''}`);option.value=key;option.dataset.origin=origin;return option;}));
 $('photoPoint').value=activePoint;
 const marked=keys.filter(key=>photo?.points[key]).length;
 $('pointInstruction').textContent=`${marked}/${keys.length} puntos · ${POINTS[activePoint][1]}`;
 $('resetPoints').disabled=!photo||!!stream;$('undoPoint').disabled=!photo?.history.length||!!stream;
}
function drawDetectedPose(context,landmarks,width,height,highlight){
 if(!Array.isArray(landmarks))return;
 const unit=Math.max(width,height)/700;
 context.save();context.strokeStyle='#38bdf8';context.lineWidth=2*unit;context.setLineDash([]);
 for(const [a,b]of POSE_CONNECTIONS){const p=landmarks[a],q=landmarks[b];if(!p||!q)continue;context.beginPath();context.moveTo(p.x*width,p.y*height);context.lineTo(q.x*width,q.y*height);context.stroke();}
 for(const item of BODY_LANDMARKS){const p=landmarks[item.index];if(!p)continue;const selected=highlight&&item.index===activeAiPoint;context.beginPath();context.arc(p.x*width,p.y*height,(selected?7:3.5)*unit,0,Math.PI*2);context.fillStyle=selected?'#ffcf50':'#38bdf8';context.fill();context.strokeStyle='#102b46';context.lineWidth=unit;context.stroke();}
 context.restore();
}
function renderAiPointHelp(){
 const photo=currentPhoto(),item=BODY_LANDMARKS.find(p=>p.index===activeAiPoint),p=photo?.ai?.landmarks?.[activeAiPoint];
 $('aiPointHelp').textContent=item?(p?`${item.label}: detectado. Es un punto anatómico aproximado; revisa su posición en la foto.`:`${item.label}: no se detectó con visibilidad suficiente. Prueba con mejor luz o una toma más clara.`):'';
}
function renderRecognition(){
 const photo=currentPhoto(),info=photo?.recognition;
 $('recognizePhoto').disabled=!photo||!!stream||isFoot()||photo.demo;
 $('recognizePhoto').textContent=recognitionController?'Cancelar análisis':'Reconocer puntos con IA';
 $('recognitionStatus').dataset.state=info?.state||'idle';
 $('recognitionStatus').textContent=isFoot()?'El modelo corporal no detecta el contorno preciso del pie. Usa la referencia y el marcado para calzado.':info?.text||'Captura o carga una foto corporal. La IA marcará los puntos visibles.';
 $('aiHostingLink').hidden=location.protocol!=='file:';
 const ai=photo?.ai;$('landmarkSummary').textContent=ai?.count===1?`${ai.visibleCount} de 33 puntos corporales visibles · MediaPipe Pose`:'';
 $('aiPointSelect').disabled=!ai||ai.count!==1;
 $('aiPointSelect').replaceChildren(...BODY_LANDMARKS.map(item=>{const option=node('option',`${ai?.landmarks?.[item.index]?'✓ ':'○ '}${item.label}`);option.value=String(item.index);return option;}));
 $('aiPointSelect').value=String(activeAiPoint);renderAiPointHelp();
}
function cancelRecognition(){
 recognitionRun++;if(recognitionController){recognitionController.abort();recognitionController=null;const photo=currentPhoto();if(photo?.recognition?.state==='loading')photo.recognition={state:'idle',text:'Análisis detenido. Puedes volver a reconocer puntos o marcarlos manualmente.'};}
 renderRecognition();
}
async function recognizeCurrentPhoto(){
 const photo=currentPhoto(),view=state.view,garment=state.garment;if(!photo||stream||isFoot()||photo.demo||state.step!==3)return;
 cancelRecognition();
 if(location.protocol==='file:'){photo.recognition={state:'unavailable',text:'La detección IA necesita la versión HTTPS con conexión para cargar el modelo. Puedes seguir con el marcado manual.'};renderRecognition();return;}
 const controller=new AbortController(),run=++recognitionRun;recognitionController=controller;
 const valid=()=>run===recognitionRun&&!controller.signal.aborted&&currentPhoto()===photo&&state.view===view&&state.garment===garment&&state.step===3;
 photo.recognition={state:'loading',text:'Cargando el modelo corporal y reconociendo puntos en esta foto…'};renderRecognition();
 try{
  const {detectPhotoPose}=await import('/photo-vision.mjs');if(!valid())return;
  const output=await detectPhotoPose({image:photo.source,signal:controller.signal,onStatus:text=>{if(valid()){photo.recognition.text=text;renderRecognition();}}});if(!valid())return;
  const mapped=mapPoseToPhoto({landmarks:output.landmarks,width:photo.source.width,height:photo.source.height,view});
  snapshotPoints();
  for(const key of Object.keys(photo.origins))if(photo.origins[key]==='ai'){delete photo.points[key];delete photo.origins[key];}
  let added=0;for(const [key,point]of Object.entries(mapped.points)){if(!pointKeys(view).includes(key)||photo.origins[key]==='manual')continue;photo.points[key]=point;photo.origins[key]='ai';added++;}
  photo.ai=mapped;$('multiviewAccepted').checked=false;
  photo.recognition={state:mapped.count===0?'empty':mapped.count>1?'multiple':'ready',text:mapped.count===0?'No se detectó una persona. Incluye el cuerpo, mejora la luz y vuelve a intentarlo.':mapped.count>1?'Hay más de una persona. Usa una foto con una sola persona para proponer puntos.':`La IA detectó ${mapped.visibleCount} de 33 puntos visibles y propuso ${added} apoyos de medición. Revisa las articulaciones; completa coronilla, suelo y bordes manualmente.`};
  activePoint=pointKeys().find(key=>!photo.points[key])||pointKeys()[0];
  renderPointControls();drawPhoto();renderPhotoResults();
 }catch(error){if(!valid())return;photo.recognition={state:'error',text:'No se pudo completar la detección IA. Comprueba la conexión o inténtalo de nuevo. El marcado manual sigue disponible.'};}
 finally{if(run===recognitionRun){recognitionController=null;renderRecognition();}}
}
function photoMeasurement(photo=currentPhoto(), view=state.view) {
 if(!photo)return {measures:[],warnings:[],errors:[]};
 const keys=pointKeys(view),points=Object.fromEntries(Object.entries(photo.points).filter(([key])=>keys.includes(key)));
 const result=measurePhoto({kind:isFoot()?'foot':'body',view:!isFoot()?view:'front',points,width:photo.source.width,height:photo.source.height,heightCm:Number($('height').value),referenceCm:Number($('reference').value)});
 const allowed=isFoot()?['footLength','footWidth']:view==='side'?['chestDepth','waistDepth','hipDepth']:state.garment==='shirt'?['shoulderWidth','chestWidth','waistWidth','torsoLength','sleeveLength']:state.garment==='pants'?['waistWidth','hipWidth','legLength','inseam']:['waistWidth','hipWidth'];
 result.measures=result.measures.filter(measure=>allowed.includes(measure.id));return result;
}
function renderMultiview() {
 const target=$('multiviewResults');target.replaceChildren();$('multiviewPanel').hidden=isFoot();if(isFoot())return;
 if(!$('multiviewAccepted').checked){target.append(node('p','Completa y comprueba las dos vistas para explorar esta aproximación. No interviene en la talla.','hint'));return;}
 const front=state.photos.front,side=state.photos.side;
 if(!front||!side||front.demo!==side.demo){target.append(node('p','Faltan dos capturas compatibles de esta sesión.','hint'));return;}
 const f=photoMeasurement(front,'front'),s=photoMeasurement(side,'side');
 if(f.errors.length||s.errors.length){target.append(node('p','Revisa escala y puntos de ambas vistas antes de comparar.','hint'));return;}
 let count=0;
 for(const key of state.garment==='shirt'?['chest','waist']:['waist','hip']){
  const width=f.measures.find(m=>m.id===key+'Width')?.value,depth=s.measures.find(m=>m.id===key+'Depth')?.value;
  if(!width||!depth)continue;
  const frontKeys=key==='chest'?['chestL','chestR']:key==='waist'?['waistL','waistR']:['hipL','hipR'];
  const sideKeys=key==='chest'?['chestFront','chestBack']:key==='waist'?['waistFront','waistBack']:['hipFront','hipBack'];
  const level=(photo,keys)=>(keys.reduce((sum,k)=>sum+photo.points[k].y,0)/2-photo.points.top.y)/(photo.points.bottom.y-photo.points.top.y);
  if(Math.abs(level(front,frontKeys)-level(side,sideKeys))>.035){target.append(node('p',`${FIELDS[key][0]}: los niveles difieren entre las vistas. Vuelve a marcar o capturar.`,'hint'));continue;}
  const value=ellipseCircumference({width,depth});if(!value)continue;count++;
  const row=node('div',undefined,'photo-row');row.append(node('span',`${FIELDS[key][0]} · elipse ideal`),node('strong',`≈ ${format(Math.round(value))} cm`));target.append(row);
  const tape=Number(state.measurements[key]);if(tape>0)target.append(node('p',`Diferencia frente a tu medida física: ≈ ${format(Math.round(value-tape))} cm. Esta diferencia no corrige ni valida la cámara.`,'hint'));
 }
 if(!count)target.append(node('p','Marca ambos bordes de una misma zona en frente y perfil, además de cabeza y suelo.','hint'));
}
function renderPhotoResults() {
 renderMultiview();
 const photo=currentPhoto(), target=$('photoResults');target.replaceChildren();$('photoWarnings').replaceChildren();
 if(stream){target.append(node('p','Captura una foto para marcar y calcular.','hint'));return;}
 if(!photo){target.append(node('p','Aparecerán al calibrar y marcar los puntos.','hint'));return;}
 const missing=pointKeys().filter(key=>!photo.points[key]);
 if(missing.length)target.append(node('p',`Faltan ${missing.length} apoyos para completar esta vista. ${isFoot()?'La referencia física debe estar en el mismo plano.':'Confirma coronilla y suelo; los contornos requieren marcar sus bordes.'}`,'hint'));
 if(!isFoot()&&(!photo.points.top||!photo.points.bottom))return;
 const output=photoMeasurement(photo);
 for(const measure of output.measures){const row=node('div',undefined,'photo-row');row.append(node('span',measure.label),node('strong',`≈ ${format(isFoot()?measure.value:Math.round(measure.value))} cm`));target.append(row);}
 if(!output.measures.length)target.append(node('p','Revisa los puntos o la calibración.','hint'));
 for(const message of [...output.errors,...output.warnings]) $('photoWarnings').append(node('p',message));
}
function drawPhoto() {
 const photo=currentPhoto();if(!photo||stream)return;const {source,points}=photo;
 ctx.clearRect(0,0,canvas.width,canvas.height);ctx.drawImage(source,0,0);if($('showAiPoints').checked&&photo.ai?.landmarks)drawDetectedPose(ctx,photo.ai.landmarks,canvas.width,canvas.height,true);const u=Math.max(canvas.width,canvas.height)/700;
 const segments=isFoot()?[['refA','refB'],['heel','toe'],['footL','footR']]:state.view==='side'?[['top','bottom'],['chestFront','chestBack'],['waistFront','waistBack'],['hipFront','hipBack']]:[['top','bottom'],['shoulderL','shoulderR'],['chestL','chestR'],['waistL','waistR'],['hipL','hipR'],['shoulderR','elbow'],['elbow','wrist'],['crotch','bottom']];
 const keys=pointKeys();
 for(const [a,b]of segments){if(!points[a]||!points[b]||!keys.includes(a)||!keys.includes(b))continue;ctx.beginPath();ctx.moveTo(points[a].x,points[a].y);ctx.lineTo(points[b].x,points[b].y);ctx.lineWidth=2*u;ctx.strokeStyle=a==='refA'?'#ffcf50':'#45d9c7';ctx.setLineDash(a==='top'?[6*u,5*u]:[]);ctx.stroke();}
 ctx.setLineDash([]);keys.forEach((key,index)=>{const p=points[key];if(!p)return;ctx.beginPath();ctx.arc(p.x,p.y,(key===activePoint?12:10)*u,0,Math.PI*2);ctx.fillStyle=key===activePoint?'#ffcf50':'#145dc4';ctx.fill();ctx.lineWidth=2*u;ctx.strokeStyle='white';ctx.stroke();ctx.fillStyle=key===activePoint?'#172b4d':'white';ctx.font=`bold ${11*u}px system-ui`;ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillText(String(index+1),p.x,p.y);});
}
function drawLoupe(p) {
 if(!$('showLoupe').checked||!currentPhoto())return;
 const c=$('loupe'),d=c.getContext('2d'),source=currentPhoto().source; const region=Math.max(source.width,source.height)/8;
 d.fillStyle='#eaf0f7';d.fillRect(0,0,150,150);d.drawImage(source,p.x-region/2,p.y-region/2,region,region,0,0,150,150);d.strokeStyle='#ffcf50';d.lineWidth=2;d.beginPath();d.moveTo(60,75);d.lineTo(90,75);d.moveTo(75,60);d.lineTo(75,90);d.stroke();c.hidden=false;
}
function drawOverlay() {
 if(!stream||!video.videoWidth)return;
 const rect=$('stage').getBoundingClientRect(),ratio=Math.min(rect.width/video.videoWidth,rect.height/video.videoHeight),w=video.videoWidth*ratio,h=video.videoHeight*ratio;
 overlay.width=video.videoWidth;overlay.height=video.videoHeight;Object.assign(overlay.style,{left:`${(rect.width-w)/2}px`,top:`${(rect.height-h)/2}px`,width:`${w}px`,height:`${h}px`});
 const d=overlayCtx,W=overlay.width,H=overlay.height;d.clearRect(0,0,W,H);const unit=Math.max(W,H)/700;
 if($('showGuide').checked){
  const spread=Number($('guideWidth').value)/100,center=W/2,top=H*.07,bottom=H*.92,bodyH=bottom-top;
  d.strokeStyle='#d5efb7';d.lineWidth=2*unit;d.setLineDash([7*unit,6*unit]);d.beginPath();d.moveTo(center,top);d.lineTo(center,bottom);d.moveTo(W*.1,bottom);d.lineTo(W*.9,bottom);d.stroke();d.setLineDash([]);
  if(isFoot()){d.beginPath();d.ellipse(center,H*.48,W*.15,H*.32,0,0,Math.PI*2);d.stroke();d.beginPath();d.moveTo(W*.12,H*.89);d.lineTo(W*.88,H*.89);d.stroke();}
  else if(state.view==='side'){const half=Math.min(W*spread/3,bodyH*.13);d.beginPath();d.ellipse(center,top+bodyH*.08,bodyH*.045,bodyH*.075,0,0,Math.PI*2);d.moveTo(center-half*.4,top+bodyH*.17);d.bezierCurveTo(center-half*.9,top+bodyH*.28,center-half*.5,top+bodyH*.45,center-half*.65,top+bodyH*.6);d.lineTo(center-half*.35,bottom);d.lineTo(center+half*.85,bottom);d.moveTo(center+half*.4,top+bodyH*.17);d.bezierCurveTo(center+half,top+bodyH*.32,center+half*.4,top+bodyH*.45,center+half*.6,top+bodyH*.6);d.lineTo(center+half*.35,bottom);d.moveTo(center+half*.1,top+bodyH*.23);d.lineTo(center+half*.9,top+bodyH*.56);d.stroke();}
  else{const half=Math.min(W*spread/2,bodyH*.23);d.beginPath();d.ellipse(center,top+bodyH*.08,bodyH*.045,bodyH*.075,0,0,Math.PI*2);d.moveTo(center-half*.75,top+bodyH*.23);d.lineTo(center-half*.47,top+bodyH*.18);d.lineTo(center+half*.47,top+bodyH*.18);d.lineTo(center+half*.75,top+bodyH*.23);d.lineTo(center+half,top+bodyH*.55);d.moveTo(center-half*.75,top+bodyH*.23);d.lineTo(center-half,top+bodyH*.55);d.moveTo(center-half*.47,top+bodyH*.21);d.lineTo(center-half*.35,top+bodyH*.5);d.lineTo(center-half*.46,top+bodyH*.61);d.lineTo(center-half*.38,bottom);d.moveTo(center+half*.47,top+bodyH*.21);d.lineTo(center+half*.35,top+bodyH*.5);d.lineTo(center+half*.46,top+bodyH*.61);d.lineTo(center+half*.38,bottom);d.moveTo(center,top+bodyH*.61);d.lineTo(center-half*.12,bottom);d.moveTo(center,top+bodyH*.61);d.lineTo(center+half*.12,bottom);d.stroke();}
 }
 if(pose?.landmarks?.[0]&&!isFoot()){
  const mapped=mapPoseToPhoto({landmarks:pose.landmarks,width:W,height:H,view:state.view});
  drawDetectedPose(d,mapped.landmarks,W,H,false);
 }
}

function canCapture(){return !!(stream&&video.videoWidth&&video.videoHeight&&video.readyState>=2&&!assistLoading&&(!assistant||(pose?.quality.ready&&performance.now()-poseAt<700)));}
function updateCaptureReadiness(){const ready=canCapture();$('capture').disabled=!ready;$('captureReadiness').textContent=assistLoading?'Preparando controles de postura…':assistant?(ready?'Postura estable para capturar. Comprueba visualmente coronilla y plantas.':'Espera a tener postura estable y todos los controles de encuadre. Puedes detener el asistente y revisar manualmente.'):'Captura manual: comprueba cabeza, pies y postura.';}
function disposeAssistant() { assistToken++;assistantController?.abort();assistantController=null;clearTimeout(poseExpiry);poseAt=0;assistLoading=false; if(assistant)assistant.dispose();assistant=null;pose=null;$('poseChecks').hidden=true;$('assistButton').textContent='Activar detección en vivo';$('assistButton').disabled=isFoot()||state.view!=='front';updateCaptureReadiness(); }
function stopCamera() {
 cancelRecognition();cameraToken++;if(stream)stream.getTracks().forEach(track=>track.stop());stream=null;video.srcObject=null;video.hidden=true;overlay.hidden=true;$('captureAction').hidden=true;$('stopCamera').hidden=true;$('capture').disabled=true;$('startCamera').disabled=false;$('facing').disabled=false;disposeAssistant();
 if(state.step===3)renderCapture();
}
function leaveDemo() { if(!state.demo)return;state.demo=false;state.photos={};state.measurements={};state.repeats={};state.ease={};$('multiviewAccepted').checked=false;$('height').value='';$('reference').value='20';$('confirmed').checked=false;$('referenceAccepted').checked=false;$('demoBanner').hidden=true;renderMeasureFields(); }
async function startCamera() {
 leaveDemo();stopCamera();const token=cameraToken;imageToken++;$('startCamera').disabled=true;$('stopCamera').hidden=false;
 if(!navigator.mediaDevices?.getUserMedia){$('startCamera').disabled=false;status('No hay acceso a cámara en este contexto. Abre el enlace HTTPS o usa Cargar foto.',true);return;}
 status('Esperando permiso de cámara…');
 try{
  const next=await navigator.mediaDevices.getUserMedia({video:{facingMode:{ideal:$('facing').value},width:{ideal:1080},height:{ideal:1440}},audio:false});
  if(token!==cameraToken){next.getTracks().forEach(track=>track.stop());return;}
  stream=next;video.srcObject=stream;$('facing').disabled=true;renderCapture();await video.play();if(token!==cameraToken)return;
  updateCaptureReadiness();drawOverlay();status('Revisa cabeza y pies completos, o el pie y su referencia. La silueta es una ayuda de encuadre.');
  if($('autoRecognize').checked&&!isFoot()&&state.view==='front')void enableAssistant();
 }catch(error){if(token!==cameraToken)return;stopCamera();const reasons={NotAllowedError:'No se concedió permiso de cámara. Puedes revisarlo en el navegador o cargar una foto.',NotFoundError:'No se encontró una cámara. Usa Cargar foto.',NotReadableError:'La cámara está ocupada. Cierra otras apps que la usen o carga una foto.'};status(reasons[error.name]||'No se pudo iniciar la cámara. Usa un navegador con HTTPS o carga una foto.',true);}
}
function setPhoto(image,{demo=false,points={},view=state.view,framing='Foto cargada o ejemplo; sin control automático de captura.'}={}) {
 stopCamera();const w=image.naturalWidth||image.width,h=image.naturalHeight||image.height,ratio=Math.min(1,1600/Math.max(w,h));
 const source=document.createElement('canvas');source.width=Math.round(w*ratio);source.height=Math.round(h*ratio);source.getContext('2d').drawImage(image,0,0,source.width,source.height);
 $('multiviewAccepted').checked=false;
 state.photos[view]={source,points:Object.fromEntries(Object.entries(points).map(([key,p])=>[key,{x:p.x*ratio,y:p.y*ratio}])),origins:Object.fromEntries(Object.keys(points).map(key=>[key,'manual'])),ai:null,recognition:{state:'idle',text:demo?'Ejemplo dibujado: la detección se prueba con una foto real.':'Foto lista para detectar puntos corporales.'},history:[],demo,framing};
 activePoint=pointKeys()[0];renderCapture();status('Foto lista. La IA puede proponer articulaciones; revisa los apoyos y la calibración.');
 if($('autoRecognize').checked&&!isFoot()&&!demo)void recognizeCurrentPhoto();
}
async function enableAssistant(){
 if(!stream){$('assistStatus').textContent='Activa primero la cámara para usar la guía automática.';return;}
 if(assistLoading){disposeAssistant();$('assistStatus').textContent='Carga de IA cancelada. Puedes continuar manualmente.';return;}
 if(assistant){disposeAssistant();drawOverlay();$('assistStatus').textContent='Asistente detenido. Puedes seguir con la silueta y el marcado manual.';return;}
 if(location.protocol==='file:'){$('assistStatus').textContent='El asistente requiere la versión HTTPS. El marcado manual del HTML funciona sin conexión.';return;}
 const token=++assistToken,controller=new AbortController();assistantController=controller;assistLoading=true;updateCaptureReadiness();$('assistButton').disabled=false;$('assistButton').textContent='Cancelar carga de IA';$('assistStatus').textContent='Preparando MediaPipe en este dispositivo…';
 try{
  const {createPoseAssistant}=await import('/vision.mjs');
  if(token!==assistToken||!stream||controller.signal.aborted)return;
  const next=await createPoseAssistant({video,signal:controller.signal,onStatus:message=>{if(token===assistToken){$('assistStatus').textContent=message;if(message.includes('no disponible')){disposeAssistant();updateCaptureReadiness();}}},onResult:result=>{if(token!==assistToken||!stream)return;pose=result;poseAt=result.capturedAt;clearTimeout(poseExpiry);poseExpiry=setTimeout(()=>{pose=null;poseAt=0;$('poseChecks').hidden=true;$('assistStatus').textContent='Revisión de postura caducada; espera un nuevo cuadro o continúa manualmente.';updateCaptureReadiness();drawOverlay();},Math.max(0,700-(performance.now()-poseAt)));updateCaptureReadiness();drawOverlay();$('assistStatus').textContent=result.message;$('poseChecks').hidden=false;const labels={person:'Una persona',centered:'Centrado',fullBody:'Puntos visibles',framing:'Tamaño en cuadro',level:'Hombros nivelados',hips:'Caderas niveladas',frontal:'Frente aproximado',arms:'Brazos separados',stable:'Postura estable'};$('poseChecks').replaceChildren(...Object.entries(labels).map(([key,label])=>node('span',`${result.checks[key]?'✓':'○'} ${label}`,`check-chip${result.checks[key]?' ok':''}`)));}});
  if(token!==assistToken||!stream){next.dispose();return;}assistant=next;assistLoading=false;updateCaptureReadiness();assistant.start();$('assistButton').disabled=false;$('assistButton').textContent='Detener asistente';
 }catch(error){if(token!==assistToken)return;assistLoading=false;updateCaptureReadiness();$('assistStatus').textContent='No se pudo preparar el asistente. La cámara y el marcado manual siguen disponibles.';$('assistButton').disabled=false;}
}
function eventPoint(event){const rect=canvas.getBoundingClientRect();return {x:Math.max(0,Math.min(canvas.width,(event.clientX-rect.left)*canvas.width/rect.width)),y:Math.max(0,Math.min(canvas.height,(event.clientY-rect.top)*canvas.height/rect.height))};}
function snapshotPoints(){const photo=currentPhoto();if(!photo)return;photo.history.push({points:structuredClone(photo.points),origins:{...photo.origins}});if(photo.history.length>35)photo.history.shift();}
function updatePoint(point){$('multiviewAccepted').checked=false;const photo=currentPhoto();if(!photo||stream)return;photo.points[dragKey||activePoint]=point;photo.origins[dragKey||activePoint]='manual';renderPointControls();drawPhoto();drawLoupe(point);renderPhotoResults();}
function repeatSummary(key) { return summarizeRepeated(state.repeats[key]||[],{maxSpread:isFoot()?.3:1}); }
function syncRepeated(key) {
 const summary=repeatSummary(key);state.measurements[key]=summary.status==='ready'?String(summary.value):'';
 const input=$('measure-'+key);if(input)input.value=state.measurements[key];
 const label=$('repeat-status-'+key);if(label){label.classList.toggle('problem',summary.status!=='ready');label.textContent=summary.value!==null?`Mediana: ${format(summary.value)} cm · rango observado: ${format(summary.min)}–${format(summary.max)} cm. ${summary.status==='ready'?'Lecturas consistentes.':'Repite las tres lecturas.'}`:summary.warnings[0];}
 return summary;
}
function renderMeasureFields(){
 const required=requiredFieldsFor(state.garment),optional=state.garment==='shirt'?['sleeve']:state.garment==='pants'?['inseam']:state.garment==='skirt'?['skirtLength']:[];
 const repeated=$('measurementMode').value==='repeat';
 $('measurementHeading').textContent=isFoot()?'Longitudes comprobadas con regla':'Contornos comprobados con cinta';
 $('measurementFields').replaceChildren(...[...required,...optional].map(key=>{
  const field=node('div',undefined,'measurement-field'),label=node('label',FIELDS[key][0]+(repeated&&required.includes(key)?' · mediana':''),'field');label.htmlFor='measure-'+key;label.append(node('span','cm'));
  const input=document.createElement('input');input.id='measure-'+key;input.type='number';input.inputMode='decimal';input.step='.1';input.min=isFoot()?'8':'1';input.max=isFoot()?'35':'250';input.placeholder=isFoot()?'Ej. 18.5':'En centímetros';input.value=state.measurements[key]??'';
  input.readOnly=repeated&&required.includes(key);input.setAttribute('aria-describedby','help-'+key);const hint=node('p',FIELDS[key][1],'hint');hint.id='help-'+key;
  input.addEventListener('input',()=>{state.measurements[key]=input.value;$('confirmed').checked=false;});field.append(label,input,hint);
  if(input.readOnly){const group=node('div',undefined,'repeat-inputs');for(let i=0;i<3;i++){const l=node('label',`Lectura ${i+1}`),r=document.createElement('input');r.type='number';r.inputMode='decimal';r.step='.1';r.min=input.min;r.max=input.max;r.id=`repeat-${key}-${i}`;r.value=state.repeats[key]?.[i]??'';l.htmlFor=r.id;r.addEventListener('input',()=>{(state.repeats[key]??=['','',''])[i]=r.value;$('confirmed').checked=false;syncRepeated(key);});l.append(r);group.append(l);}const summary=node('p',undefined,'repeat-summary');summary.id='repeat-status-'+key;field.append(group,summary);}
  return field;
 }));
 if(repeated)for(const key of required)syncRepeated(key);
 const note=node('p',repeated?`Repite si la diferencia supera ${isFoot()?'0,3':'1'} cm. Es un umbral operativo del prototipo, no una garantía de precisión.`:'Una sola lectura no permite comprobar repetibilidad. Usa tres lecturas para detectar variaciones.','hint');$('measurementFields').append(note);
}
function availableCatalogs(){return [...CATALOGS,...state.customCatalogs].filter(c=>(isFoot()?c.kind==='foot':['body','garment'].includes(c.kind))&&(!c.garment||c.garment===state.garment));}
function getCatalog(){const available=availableCatalogs();return available.find(c=>c.id===state.catalogId)||available[0];}
function renderCatalogs(){
 const catalogs=availableCatalogs();if(!catalogs.some(c=>c.id===state.catalogId))state.catalogId=catalogs[0]?.id;
 $('catalog').replaceChildren(...catalogs.map(c=>{const option=node('option',c.name);option.value=c.id;return option;}));$('catalog').value=state.catalogId;renderCatalogDetails();
}
function renderCatalogDetails(){
 const c=getCatalog();renderEaseFields(c);$('catalogKind').disabled=isFoot();if(isFoot())$('catalogKind').value='body';$('catalogNote').textContent=c?`${c.note||'Tabla corporal importada para esta prenda.'} ${c.date?'Consultada: '+c.date+'.':''}`:'Selecciona una tabla.';
 $('catalogSource').hidden=!c?.source;if(c?.source)$('catalogSource').href=c.source;
 $('referenceAcceptanceLabel').textContent=c?.id?.startsWith('custom-')?'Confirmo que la tabla, su tipo de medida y las holguras indicadas corresponden a este proveedor y modelo.':'Entiendo que es una referencia de esta marca para pruebas y puede diferir de la del proveedor del colegio.';
 const columns=isFoot()?[['size','Talla Clarks EU / proveedor'],['foot','Pie (cm)']]:[['size','Talla'],['chest',c?.kind==='garment'?'Pecho prenda (cm)':'Pecho cuerpo (cm)'],['waist',c?.kind==='garment'?'Cintura prenda (cm)':'Cintura cuerpo (cm)'],['hip',c?.kind==='garment'?'Cadera prenda (cm)':'Cadera cuerpo (cm)']];
 const table=document.createElement('table'),head=document.createElement('thead'),tr=document.createElement('tr');for(const [,label]of columns)tr.append(node('th',label));head.append(tr);table.append(head);const body=document.createElement('tbody');for(const row of c?.rows||[]){const line=document.createElement('tr');for(const [key]of columns)line.append(node('td',row[key]===undefined?'—':String(row[key])));body.append(line);}table.append(body);$('catalogTable').replaceChildren(table);
}
function renderEaseFields(catalog) {
 const target=$('easeFields');target.replaceChildren();if(catalog?.kind!=='garment')return;
 target.append(node('p','Tabla de prenda terminada: indica la holgura mínima de cada contorno según este proveedor y tejido. No se presupone ningún valor.','notice compact'));
 const config=state.ease[catalog.id]??={};
 for(const key of requiredFieldsFor(state.garment)){const label=node('label',`Holgura mínima · ${FIELDS[key][0]} (cm)`,'field small');label.htmlFor='ease-'+key;const input=document.createElement('input');input.id='ease-'+key;input.type='number';input.min='0';input.max='60';input.step='.1';input.value=config[key]??'';input.placeholder='Dato del proveedor';input.addEventListener('input',()=>{config[key]=input.value;$('referenceAccepted').checked=false;});target.append(label,input);}
}
function recommendation(){
 const repeated=$('measurementMode').value==='repeat',ranges={},problems=[];
 if(repeated)for(const key of requiredFieldsFor(state.garment)){const summary=syncRepeated(key);if(summary.status==='ready')ranges[key]=summary.range;else problems.push(`${FIELDS[key][0]}: ${summary.warnings[0]}`);}
 const output=evaluateFit({garment:state.garment,measurements:state.measurements,ranges,catalog:getCatalog(),ease:state.ease[getCatalog()?.id]||{},confirmed:$('confirmed').checked,referenceAccepted:$('referenceAccepted').checked});
 if(problems.length){output.status='missing';output.size=null;output.zones=[];output.warnings.unshift(...problems);}
 if(!repeated)output.warnings.push('Una lectura: no se comprobó repetibilidad ni sensibilidad de talla entre lecturas.');
 return output;
}
function renderFitEvidence(output){
 const target=$('fitStability'),boundary=output.stability.status==='boundary';target.replaceChildren();target.classList.toggle('boundary',boundary);
 const title=boundary?'Las lecturas cambian la talla':output.stability.status==='stable'?'La referencia se mantiene entre las lecturas':'Repetibilidad pendiente';
 target.append(node('h3',title),node('p',boundary?`Candidatas para revisar: ${output.stability.sizes.join(', ')||'fuera de tabla'}. Repite las medidas y prueba las alternativas; no hay una talla estable.`:output.stability.status==='stable'?'Los extremos observados llevan a la misma referencia. Esto no demuestra exactitud ni sustituye probar la prenda.':'Se necesitan tres lecturas consistentes de cada medida y una tabla confirmada para revisar si cambia la referencia.'));
 const zones=$('fitZones');zones.replaceChildren();if(!output.zones.length)return;
 const table=document.createElement('table'),head=node('thead'),row=node('tr');for(const label of ['Zona','Cuerpo (cm)','Prenda (cm)','Holgura (cm)','Mínimo indicado (cm)'])row.append(node('th',label));head.append(row);table.append(head);
 const body=node('tbody');for(const z of output.zones){const r=node('tr');for(const value of [FIELDS[z.key][0],format(z.body),format(z.garment),format(z.ease),format(z.minEase)])r.append(node('td',value));body.append(r);}table.append(body);zones.append(table,node('p','Se comprueba la holgura mínima introducida. No se simulan tensión, elasticidad ni caída del tejido.','hint'));
}
function renderRecommendation(){
 const output=recommendation(),catalog=getCatalog(),target=$('recommendation');const boundary=output.stability.status==='boundary';target.classList.toggle('ready',output.status==='ready'&&!boundary);target.replaceChildren();
 target.append(node('div',state.demo?'EJEMPLO FICTICIO':boundary?'REPETIR Y PROBAR ALTERNATIVAS':output.status==='ready'?'TALLA DE REFERENCIA PARA PROBAR':'FALTA REVISIÓN','result-kicker'));
 target.append(node('div',boundary?'Sin talla estable':output.status==='ready'?output.size:output.status==='outside'?'Fuera de esta tabla':output.status==='missing'?'Completa la verificación':'Revisa la tabla',`result-size${output.status==='ready'&&!boundary?'':' waiting'}`));
 target.append(node('p',`${GARMENT_DATA[state.garment].name} · ${catalog?.name||'Sin tabla'}`,'result-subtitle'));
 target.append(node('p',boundary?'Repite la medición y prueba las tallas candidatas antes de elegir.':output.status==='ready'?'La sugerencia es orientativa. Confirma corte, largos y ajuste con el proveedor.':'No se extrapola ni se inventa una talla cuando faltan datos o la tabla no cubre las medidas.','result-note'));
 renderFitEvidence(output);
 const evidence=$('resultEvidence');evidence.replaceChildren();for(const key of requiredFieldsFor(state.garment)){const value=state.measurements[key];evidence.append(node('span',`${FIELDS[key][0]}: ${value?format(value)+' cm':'pendiente'}`,'evidence-chip'));}
 const list=node('ul',undefined,'evidence-list');for(const text of output.details)list.append(node('li',text));if(!output.details.length)list.append(node('li','La talla necesita medidas comprobadas y una tabla aceptada.'));evidence.append(list);
 evidence.append(node('p',Object.keys(state.photos).length?`Capturas de apoyo: ${Object.keys(state.photos).map(v=>({front:'frontal',side:'lateral',leftFoot:'pie izquierdo',rightFoot:'pie derecho'})[v]).join(', ')}. No se usan anchos de foto como contornos.`:'Recorrido con cinta o regla; sin fotografía.','hint'));
 const warnings=[...output.warnings];if(state.garment==='shirt')warnings.push('Verifica cuello, manga y largo con el modelo de camisa; esta referencia compara pecho.');if(state.garment==='pants')warnings.push('Comprueba entrepierna y largo del pantalón por separado.');if(state.garment==='skirt')warnings.push('Comprueba el largo solicitado por el colegio.');if(isFoot())warnings.push('Esta comparación por largo no determina ancho, horma ni ajuste.');
 $('reviewWarnings').replaceChildren(...warnings.map(text=>node('p',text)));
}
function reportText(){
 const output=recommendation(),catalog=getCatalog(),lines=['TALLALAB 2.2 — INFORME ORIENTATIVO',state.demo?'EJEMPLO FICTICIO. NO CORRESPONDE A UNA PERSONA.':'Sesión de prueba; datos introducidos por el usuario.',`Fecha: ${new Date().toLocaleString('es-GT')}`,`Prenda: ${GARMENT_DATA[state.garment].name}`,`Referencia: ${catalog?.name||'Sin tabla'}`,`Fuente: ${catalog?.source||'Tabla importada por el usuario'}`,`Estado: ${output.stability.status==='boundary'?'boundary':output.status}`,`Talla de referencia: ${output.stability.status==='boundary'?'Sin talla estable; referencia central '+(output.size||'fuera de tabla'):output.size||'No se asigna'}`,`Tipo de tabla: ${catalog?.kind||'sin tabla'}`,`Método: ${$('measurementMode').value==='repeat'?'Tres lecturas independientes':'Una lectura'}`,'','MEDIDAS INTRODUCIDAS (cm)'];
 for(const [key,value]of Object.entries(state.measurements))if(value&&FIELDS[key])lines.push(`${FIELDS[key][0]}: ${value}`);
 for(const key of requiredFieldsFor(state.garment)){if($('measurementMode').value==='repeat'){const r=repeatSummary(key);lines.push(`${FIELDS[key][0]} · lecturas: ${(state.repeats[key]||[]).join(', ')}; estado ${r.status}; rango observado ${r.range?.join(' a ')||'pendiente'} cm.`);}}
 lines.push(`Estabilidad de referencia: ${output.stability.status}; tallas candidatas: ${output.stability.sizes.join(', ')||'sin determinar'}`,`Verificación declarada con cinta o regla: ${$('confirmed').checked?'sí':'pendiente'}`,`Referencia aceptada: ${$('referenceAccepted').checked?'sí':'pendiente'}`,'','APOYO FOTOGRÁFICO: ESTIMACIONES');
 for(const [view,photo]of Object.entries(state.photos)){const result=photoMeasurement(photo,view);lines.push(`Vista: ${view}`,`Encuadre: ${photo.framing||'Manual'}`,`Detección IA: ${photo.ai?.count===1?photo.ai.visibleCount+' de 33 puntos visibles':'sin detección única conservada'}`,`Apoyos propuestos por IA pendientes de corrección: ${Object.keys(photo.origins||{}).filter(key=>photo.origins[key]==='ai').map(key=>POINTS[key]?.[0]||key).join(', ')||'ninguno'}`);for(const measure of result.measures)lines.push(`${measure.label}: aprox. ${format(measure.value)} cm`);for(const error of result.errors)lines.push(`Revisar: ${error}`);}
 lines.push('','COMPARACIÓN',...output.details,...output.warnings,'','LÍMITES','No existe una tabla universal de tallas. Se utiliza la primera referencia nominal igual o mayor en todas las dimensiones necesarias; es una regla del prototipo y no un intervalo oficial. No se suma holgura automática.','En tablas de prenda se compara cuerpo + holgura mínima explícita del proveedor. Las repeticiones describen variación observada, no un intervalo de confianza ni exactitud validada.','La foto estima distancias visibles, no contornos corporales. MediaPipe orienta postura y encuadre; no certifica centímetros. La perspectiva, ropa y marcado afectan el resultado.','Sin precisión metrológica validada ni margen de error conocido. Verifica con cinta, tabla del proveedor y prueba de prenda; para zapatos mide ambos pies y comprueba el ancho.','Las fotos no se incluyen en este informe.');return lines.join('\r\n');
}
function downloadText(text,filename,type='text/plain;charset=utf-8'){const url=URL.createObjectURL(new Blob(['\ufeff',text],{type})),a=document.createElement('a');a.href=url;a.download=filename;document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),1500);}
function makeDemo(){
 stopCamera();imageToken++;state.demo=true;state.photos={};state.catalogId=isFoot()?'clarks-kids':state.garment==='skirt'?'eci-nina':'eci-nino';state.measurements={chest:'68',waist:state.garment==='skirt'?'62':'65',hip:'76',leftFoot:'18.5',rightFoot:'18.4',sleeve:'47',inseam:'61',skirtLength:'42'};state.repeats=Object.fromEntries(Object.entries(state.measurements).map(([key,value])=>[key,[value,value,value]]));$('height').value='140';$('reference').value='20';$('confirmed').checked=true;$('referenceAccepted').checked=true;$('demoBanner').hidden=false;
 const source=document.createElement('canvas');source.width=600;source.height=800;const d=source.getContext('2d');d.fillStyle='#eaf0f7';d.fillRect(0,0,600,800);d.fillStyle='#6783a0';
 let points;
 if(isFoot()){d.beginPath();d.moveTo(280,550);d.bezierCurveTo(230,550,220,490,235,420);d.bezierCurveTo(205,330,225,240,270,190);d.bezierCurveTo(300,150,335,175,335,215);d.bezierCurveTo(390,235,375,330,360,400);d.bezierCurveTo(345,470,335,550,280,550);d.fill();d.strokeStyle='#54799e';d.lineWidth=3;d.beginPath();d.moveTo(80,650);d.lineTo(480,650);d.stroke();d.font='20px system-ui';d.fillStyle='#536b84';d.fillText('Referencia ficticia: 20 cm',170,690);points={refA:{x:80,y:650},refB:{x:480,y:650},heel:{x:300,y:550},toe:{x:300,y:180},footL:{x:230,y:350},footR:{x:370,y:350}};}
 else {d.beginPath();d.ellipse(300,115,38,45,0,0,Math.PI*2);d.fill();d.beginPath();d.moveTo(280,158);d.lineTo(320,158);d.lineTo(385,210);d.lineTo(430,330);d.lineTo(450,420);d.lineTo(423,426);d.lineTo(402,342);d.lineTo(355,265);d.lineTo(350,380);d.lineTo(370,460);d.lineTo(355,735);d.lineTo(370,748);d.lineTo(315,748);d.lineTo(300,500);d.lineTo(285,748);d.lineTo(230,748);d.lineTo(245,735);d.lineTo(230,460);d.lineTo(250,380);d.lineTo(245,265);d.lineTo(198,342);d.lineTo(177,426);d.lineTo(150,420);d.lineTo(170,330);d.lineTo(215,210);d.closePath();d.fill();points={top:{x:300,y:70},bottom:{x:300,y:748},shoulderL:{x:215,y:210},shoulderR:{x:385,y:210},chestL:{x:245,y:280},chestR:{x:355,y:280},waistL:{x:250,y:380},waistR:{x:350,y:380},hipL:{x:230,y:460},hipR:{x:370,y:460},elbow:{x:430,y:330},wrist:{x:450,y:420},crotch:{x:300,y:500}};}
 d.fillStyle='#56708b';d.textAlign='center';d.font='16px system-ui';d.fillText('EJEMPLO FICTICIO · SIN DATOS REALES',300,785);
 state.view=isFoot()?'leftFoot':'front';setPhoto(source,{demo:true,points});renderMeasureFields();renderCatalogs();selectStep(3);status('Ejemplo ficticio. Puedes ajustar puntos, verificar las medidas de ejemplo y explorar el resultado.');
}
function newSession(){stopCamera();imageToken++;state.photos={};state.measurements={};state.repeats={};state.ease={};$('multiviewAccepted').checked=false;$('autoRecognize').checked=true;state.demo=false;state.view=isFoot()?'leftFoot':'front';$('height').value='';$('reference').value='20';$('measurementMode').value='repeat';$('confirmed').checked=false;$('referenceAccepted').checked=false;$('demoBanner').hidden=true;$('photoInput').value='';$('csvStatus').textContent='';activePoint=pointKeys()[0];canvas.width=1;canvas.height=1;$('loupe').hidden=true;renderMeasureFields();renderCapture();selectStep(1);announce('Nueva sesión lista. Fotos y medidas anteriores descartadas.');}

for(const [key,data]of Object.entries(GARMENT_DATA)){const button=node('button',undefined,'garment-card');button.dataset.garment=key;button.setAttribute('aria-pressed',String(key===state.garment));const icon=document.createElementNS('http://www.w3.org/2000/svg','svg');icon.setAttribute('viewBox','0 0 84 78');icon.setAttribute('fill','none');icon.setAttribute('stroke','currentColor');icon.setAttribute('stroke-width','2');icon.setAttribute('stroke-linejoin','round');icon.setAttribute('aria-hidden','true');icon.innerHTML=data.icon;button.append(icon,node('span',data.name,'garment-name'),node('span',data.description,'garment-description'));button.addEventListener('click',()=>setGarment(key));$('garments').append(button);}
for(const button of $('steps').children)button.addEventListener('click',()=>selectStep(Number(button.dataset.step)));
document.querySelectorAll('[data-next]').forEach(button=>button.addEventListener('click',()=>selectStep(state.step+1)));
document.querySelectorAll('[data-back]').forEach(button=>button.addEventListener('click',()=>selectStep(state.step-1)));
$('skipCamera').addEventListener('click',()=>selectStep(4));$('editMeasures').addEventListener('click',()=>selectStep(4));$('measureAnother').addEventListener('click',()=>selectStep(1));
document.querySelector('.brand').addEventListener('click',event=>{event.preventDefault();selectStep(1);});
$('newSession').addEventListener('click',newSession);$('exitDemo').addEventListener('click',newSession);$('demoButton').addEventListener('click',makeDemo);
$('startCamera').addEventListener('click',startCamera);$('stopCamera').addEventListener('click',()=>{stopCamera();status('Cámara cerrada. Puedes cargar otra foto o continuar.');});
video.addEventListener('loadeddata',()=>{if(stream){updateCaptureReadiness();drawOverlay();}});
$('capture').addEventListener('click',()=>{if(!canCapture())return;const framing=assistant?'Postura y estabilidad revisadas por asistente; no certifica centímetros.':'Encuadre revisado manualmente.';imageToken++;const frame=document.createElement('canvas');frame.width=video.videoWidth;frame.height=video.videoHeight;frame.getContext('2d').drawImage(video,0,0);setPhoto(frame,{framing});});
$('photoInput').addEventListener('change',async event=>{const file=event.target.files[0];event.target.value='';if(!file)return;leaveDemo();stopCamera();const token=++imageToken,view=state.view;if(file.size>20*1024*1024){status('La foto supera 20 MB. Usa una copia más pequeña.',true);return;}status('Preparando foto…');const url=URL.createObjectURL(file),image=new Image();try{await new Promise((resolve,reject)=>{image.onload=resolve;image.onerror=reject;image.src=url;});if(token===imageToken&&view===state.view)setPhoto(image);}catch{if(token===imageToken)status('No se pudo leer esta imagen. Usa JPG, PNG o WebP compatible.',true);}finally{URL.revokeObjectURL(url);}});
$('assistButton').addEventListener('click',enableAssistant);$('showGuide').addEventListener('change',drawOverlay);$('guideWidth').addEventListener('input',drawOverlay);window.addEventListener('resize',drawOverlay);
$('photoPoint').addEventListener('change',event=>{activePoint=event.target.value;renderPointControls();drawPhoto();});
function moveActive(direction){const keys=pointKeys();activePoint=keys[(keys.indexOf(activePoint)+direction+keys.length)%keys.length];renderPointControls();drawPhoto();}
$('previousPoint').addEventListener('click',()=>moveActive(-1));$('nextPoint').addEventListener('click',()=>moveActive(1));
canvas.addEventListener('pointerdown',event=>{if(!currentPhoto()||stream)return;event.preventDefault();const p=eventPoint(event),rect=canvas.getBoundingClientRect(),radius=22*canvas.width/rect.width;const nearest=pointKeys().filter(key=>currentPhoto().points[key]).map(key=>({key,d:Math.hypot(p.x-currentPhoto().points[key].x,p.y-currentPhoto().points[key].y)})).sort((a,b)=>a.d-b.d)[0];if(nearest?.d<=radius)activePoint=nearest.key;dragKey=activePoint;pointerMoved=false;dragging=true;snapshotPoints();canvas.setPointerCapture(event.pointerId);canvas.focus({preventScroll:true});updatePoint(p);});
canvas.addEventListener('pointermove',event=>{if(!dragging)return;pointerMoved=true;updatePoint(eventPoint(event));});
canvas.addEventListener('pointerup',event=>{if(!dragging)return;updatePoint(eventPoint(event));dragging=false;dragKey=null;$('loupe').hidden=true;const next=pointKeys().find(key=>!currentPhoto().points[key]);if(next)activePoint=next;renderPointControls();drawPhoto();});
canvas.addEventListener('pointercancel',()=>{dragging=false;dragKey=null;$('loupe').hidden=true;});
canvas.addEventListener('keydown',event=>{if(!currentPhoto()||!['ArrowLeft','ArrowRight','ArrowUp','ArrowDown','Enter'].includes(event.key))return;event.preventDefault();snapshotPoints();const p={...(currentPhoto().points[activePoint]||{x:canvas.width/2,y:canvas.height/2})},amount=(event.shiftKey?10:1)*Math.max(canvas.width,canvas.height)/700;if(event.key==='ArrowLeft')p.x-=amount;if(event.key==='ArrowRight')p.x+=amount;if(event.key==='ArrowUp')p.y-=amount;if(event.key==='ArrowDown')p.y+=amount;p.x=Math.max(0,Math.min(canvas.width,p.x));p.y=Math.max(0,Math.min(canvas.height,p.y));updatePoint(p);});
canvas.addEventListener('blur',()=>{$('loupe').hidden=true;});
$('undoPoint').addEventListener('click',()=>{const photo=currentPhoto();if(!photo?.history.length)return;const previous=photo.history.pop();photo.points=previous.points;photo.origins=previous.origins;$('multiviewAccepted').checked=false;renderPointControls();drawPhoto();renderPhotoResults();});
$('resetPoints').addEventListener('click',()=>{if(!currentPhoto())return;cancelRecognition();snapshotPoints();currentPhoto().points={};currentPhoto().origins={};$('multiviewAccepted').checked=false;activePoint=pointKeys()[0];renderPointControls();drawPhoto();renderPhotoResults();});
$('height').addEventListener('input',()=>{$('multiviewAccepted').checked=false;renderPhotoResults();});$('reference').addEventListener('input',renderPhotoResults);
$('catalog').addEventListener('change',()=>{state.catalogId=$('catalog').value;$('referenceAccepted').checked=false;renderCatalogDetails();});
$('csvTemplate').addEventListener('click',()=>{const rows=isFoot()?'talla,pecho,cintura,cadera,pie_cm\r\nEJEMPLO_1,,,,18.5\r\nEJEMPLO_2,,,,19.3':'talla,pecho,cintura,cadera,pie_cm\r\nEJEMPLO_1,68,65,76,\r\nEJEMPLO_2,74,69,81,';downloadText(rows,'TallaLab-plantilla-tabla.csv','text/csv;charset=utf-8');});
$('csvInput').addEventListener('change',async event=>{const file=event.target.files[0];event.target.value='';if(!file)return;try{if(file.size>250000)throw new Error('La tabla supera 250 KB.');const garment=state.garment,kind=isFoot()?'foot':$('catalogKind').value,text=await file.text();if(garment!==state.garment)throw new Error('Cambiaste de prenda. Vuelve a importar su tabla.');const catalog=parseCatalogCsv(text,{name:$('supplierName').value.trim()||'Proveedor · tabla importada',garment,kind});catalog.id='custom-'+crypto.randomUUID();catalog.date=new Date().toLocaleDateString('sv-SE');catalog.note=kind==='garment'?'Contornos completos de prenda terminada. Requiere holguras mínimas explícitas del proveedor.':'Tabla de medidas corporales del proveedor. Verifica origen, modelo y unidades.';state.customCatalogs.push(catalog);state.catalogId=catalog.id;$('referenceAccepted').checked=false;renderCatalogs();$('csvStatus').textContent=`Tabla cargada: ${catalog.rows.length} tallas. Confirma su correspondencia antes de usarla.`;}catch(error){$('csvStatus').textContent=error.message;}});
$('downloadReport').addEventListener('click',()=>downloadText(reportText(),'TallaLab-informe.txt'));
$('printReport').addEventListener('click',()=>{$('printArea').replaceChildren(node('h1','TallaLab · Informe de prueba'),node('pre',reportText()));window.print();});
for(const source of SOURCES){const section=node('div',undefined,'source-item'),a=node('a',source.title);a.href=source.url;a.target='_blank';a.rel='noopener noreferrer';section.append(a,node('p',source.description));$('sourcesList').append(section);}
for(const id of ['sourcesButton','limitationsButton'])$(id).addEventListener('click',()=>$('sourcesDialog').showModal());$('closeSources').addEventListener('click',()=>$('sourcesDialog').close());
window.addEventListener('pagehide',stopCamera);document.addEventListener('visibilitychange',()=>{if(document.hidden)stopCamera();});
$('measurementMode').addEventListener('change',()=>{$('confirmed').checked=false;renderMeasureFields();});
$('multiviewAccepted').addEventListener('change',renderMultiview);
$('recognizePhoto').addEventListener('click',()=>{if(recognitionController)cancelRecognition();else void recognizeCurrentPhoto();});
$('autoRecognize').addEventListener('change',()=>{if(!$('autoRecognize').checked){cancelRecognition();if(assistant||assistLoading){disposeAssistant();drawOverlay();$('assistStatus').textContent='Detección automática desactivada. Puedes trabajar manualmente.';}}else if(stream&&!isFoot()&&state.view==='front')void enableAssistant();else if(currentPhoto()&&!isFoot()&&!currentPhoto().demo)void recognizeCurrentPhoto();});
$('showAiPoints').addEventListener('change',drawPhoto);
$('aiPointSelect').addEventListener('change',()=>{activeAiPoint=Number($('aiPointSelect').value);renderAiPointHelp();drawPhoto();});
renderPreparation();renderMeasureFields();renderCatalogs();renderCapture();selectStep(1,false);
