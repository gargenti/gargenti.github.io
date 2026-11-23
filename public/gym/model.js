export const MUSCLES=[
  {id:'chest',name:'Petto',mev:10}, {id:'back',name:'Schiena',mev:10},
  {id:'front',name:'Deltoide anteriore',mev:0}, {id:'side',name:'Deltoide laterale',mev:8},
  {id:'rear',name:'Deltoide posteriore',mev:8}, {id:'biceps',name:'Bicipiti',mev:8},
  {id:'triceps',name:'Tricipiti',mev:6}, {id:'quads',name:'Quadricipiti',mev:8},
  {id:'hams',name:'Femorali',mev:6}, {id:'glutes',name:'Glutei',mev:0},
  {id:'calves',name:'Polpacci',mev:8}, {id:'forearms',name:'Avambracci',mev:null}
];
// Direct targets are deliberately conservative. Secondary contributions stay separate.
export const EXERCISES={
 '392887AA':{name:'Piegamenti',direct:['chest'],indirect:['triceps','front']},
 '3601968B':{name:'Panca manubri · unilaterale',direct:['chest'],indirect:['triceps','front']},
 '79D0BB3A':{name:'Panca piana · bilanciere',direct:['chest'],indirect:['triceps','front']},
 '7EB3F7C3':{name:'Chest press',direct:['chest'],indirect:['triceps','front']},
 '422B08F1':{name:'Alzate laterali',direct:['side'],indirect:[]},
 '878CD1D0':{name:'Lento avanti · manubri',direct:['front'],indirect:['triceps','side']},
 '6A6C31A5':{name:'Lat pulldown',direct:['back'],indirect:['biceps']},
 '1DF4A847':{name:'Rematore · macchina',direct:['back'],indirect:['biceps','rear']},
 'F1D60854':{name:'Rematore · cavo',direct:['back'],indirect:['biceps','rear']},
 'D04AC939':{name:'Squat libero',direct:['quads'],indirect:['glutes']},
 'D2DD2B4A':{name:'Hack squat',direct:['quads'],indirect:['glutes']},
 '8BAB2735':{name:'Curl inclinato',direct:['biceps'],indirect:[]},
 'FAB6EB2F':{name:'Curl su panca Scott',direct:['biceps'],indirect:[]},
 '37FCC2BB':{name:'Curl manubri',direct:['biceps'],indirect:[]},
 '36E8F14E':{name:'Curl martello · cavo',direct:['biceps'],indirect:['forearms']},
 '9F48F858':{name:'Curl inverso · cavo',direct:['forearms'],indirect:['biceps']},
 '68F8A292':{name:'Skullcrusher',direct:['triceps'],indirect:[]},
 '94B7239B':{name:'Pushdown · corda',direct:['triceps'],indirect:[]},
 '75A4F6C4':{name:'Leg extension',direct:['quads'],indirect:[]},
 '11A123F3':{name:'Leg curl seduto',direct:['hams'],indirect:[]},
 'B8127AD1':{name:'Leg curl sdraiato',direct:['hams'],indirect:[]},
 '68CE0B9B':{name:'Hip thrust · macchina',direct:['glutes'],indirect:[]},
 '062AB91A':{name:'Calf raise seduto',direct:['calves'],indirect:[]},
 'E05C2C38':{name:'Calf raise in piedi',direct:['calves'],indirect:[]},
 '1006DF48':{name:'Curl polsi',direct:['forearms'],indirect:[]},
 'D8460FA6':{name:'Curl polsi inverso',direct:['forearms'],indirect:[]},
 '091737FA':{name:'Back extension',direct:[],indirect:['glutes','hams']}
};
export function definition(e){
 const known=EXERCISES[e.exercise_template_id];
 if(known)return known;
 if(/hack squat/i.test(e.title))return {name:'Hack squat',direct:['quads'],indirect:['glutes']};
 return {name:e.title,direct:[],indirect:[]};
}
const localDate = new Intl.DateTimeFormat('en-CA',{timeZone:'Europe/Rome',year:'numeric',month:'2-digit',day:'2-digit'});
export const day=w=>localDate.format(new Date(w.start_time));
export const minutes=w=>(Date.parse(w.end_time)-Date.parse(w.start_time))/60000;
export function workSets(e){return e.sets.filter(s=>s.type!=='warmup');}
export function effort(s,threshold=7){
 if(Number.isFinite(s.rpe))return s.rpe>=threshold?'near':'far';
 return s.type==='failure'?'near':'unknown';
}
export function occurrence(exercises,index){return exercises.slice(0,index).filter(e=>e.exercise_template_id===exercises[index].exercise_template_id).length;}
export function sideFactor(e,occ=0,routineId,metadata){
 return metadata.unilateral_rules.find(r=>r.exercise_template_id===e.exercise_template_id&&r.routine_id===routineId&&(r.occurrence===undefined||r.occurrence===occ))?.factor??1;
}
export function units(e,threshold=7,factor=1){
 const groups=[];
 for(const s of workSets(e)){
   if(s.type==='dropset'&&groups.length){groups.at(-1).push(s);}else groups.push([s]);
 }
 return groups.map(group=>({weight:factor,status:group.some(s=>effort(s,threshold)==='near')?'near':group.some(s=>effort(s,threshold)==='unknown')?'unknown':'far',drops:group.length>1||group[0].type==='dropset'}));
}
export function countVolume(workouts,metadata,threshold=7){
 const result=Object.fromEntries(MUSCLES.map(m=>[m.id,{near:0,unknown:0,far:0,indirect:0,total:0}]));
 const unmapped=new Set();
 for(const w of workouts)w.exercises.forEach((e,i)=>{
  const def=definition(e),u=units(e,threshold,sideFactor(e,occurrence(w.exercises,i),w.routine_id,metadata));
  if(!def.direct.length&&u.length)unmapped.add(e.title);
  for(const unit of u){
    for(const muscle of def.direct){result[muscle][unit.status]+=unit.weight;result[muscle].total+=unit.weight;}
    for(const muscle of def.indirect)if(unit.status==='near')result[muscle].indirect+=unit.weight;
  }
 });
 return {muscles:result,unmapped:[...unmapped]};
}
export function plannedVolume(routines,metadata){
 const projected=Object.fromEntries(MUSCLES.map(m=>[m.id,{total:0,indirect:0,prescribedFailure:0}]));
 for(const r of routines){const frequency=metadata.schedule.sessions_per_week[r.id]??0;
 r.exercises.forEach((e,i)=>{
  const factor=sideFactor(e,occurrence(r.exercises,i),r.id,metadata);
  const u=units(e,7,factor),total=u.reduce((a,x)=>a+x.weight,0)*frequency;
  const explicit=u.filter(x=>x.status==='near').reduce((a,x)=>a+x.weight,0)*frequency;
  const {direct,indirect}=definition(e);
  for(const muscle of direct){projected[muscle].total+=total;projected[muscle].prescribedFailure+=explicit;}
  for(const muscle of indirect)projected[muscle].indirect+=total;
 });}
 return projected;
}
export function variant(e,index,exercises){
 if(e.exercise_template_id==='D04AC939'&&/multipower|smith/i.test(e.notes??''))return 'smith';
 if(e.exercise_template_id==='878CD1D0')return occurrence(exercises,index)>0?'unilateral':'bilateral';
 return 'standard';
}
const rowVariants = ['1DF4A847','F1D60854'];
const orderPartners = {
 '6A6C31A5':rowVariants,
 '1DF4A847':['6A6C31A5'],
 'F1D60854':['6A6C31A5'],
 '79D0BB3A':['3601968B'],
 '3601968B':['79D0BB3A']
};
export function pairedExerciseOrder(exercises,index){
 const exercise=exercises[index];
 const partners=orderPartners[exercise.exercise_template_id];
 if(!partners)return null;
 const partnerIndex=exercises.findIndex(e=>partners.includes(e.exercise_template_id)&&workSets(e).length);
 if(partnerIndex<0)return null;
 const partner=exercises[partnerIndex];
 const recordedOrder=Number.isFinite(exercise.index)&&Number.isFinite(partner.index)&&exercise.index!==partner.index;
 const isFirst=recordedOrder ? exercise.index<partner.index : index<partnerIndex;
 const ordered=isFirst ? [exercise,partner] : [partner,exercise];
 return {isFirst,label:ordered.map(e=>definition(e).name).join(' → ')};
}
export function estimatedOneRepMax(kg, reps) {
 if (!Number.isFinite(kg) || kg <= 0 || !Number.isFinite(reps) || reps < 1) return null;
 return reps === 1 ? kg : kg * (1 + reps / 30);
}
export function observations(workouts,id,chosenVariant='standard',side){
 return workouts.flatMap(w=>w.exercises.flatMap((e,i)=>{
  if(e.exercise_template_id!==id||variant(e,i,w.exercises)!==chosenVariant)return [];
  const workingSets=workSets(e);
  const sets=side ? workingSets.filter((_,index)=>index%2===(side==='left'?0:1)) : workingSets;
  const s=sets[0];if(!s||!Number.isFinite(s.reps))return [];
  const weightedSets=sets.filter(set=>Number.isFinite(set.weight_kg)&&Number.isFinite(set.reps));
  const volumeLoad=weightedSets.some(set=>set.weight_kg>0)
   ? weightedSets.reduce((total,set)=>total+set.weight_kg*set.reps,0)
   : null;
  return [{date:day(w),kg:s.weight_kg,reps:s.reps,rpe:s.rpe,note:e.notes??'',workout:w.title,
   workoutId:w.id,startTime:w.start_time,
   pairOrder:pairedExerciseOrder(w.exercises,i),
   workSeries:sets,volumeLoad,volumeComplete:weightedSets.length===sets.length,
   totalReps:sets.reduce((a,s)=>a+(s.reps??0),0),sets:sets.length,index:e.index}];
 })).sort((a,b)=>Date.parse(a.startTime)-Date.parse(b.startTime));
}
export function routineWorkouts(workouts,routine){
 return workouts.filter(w=>w.routine_id===routine.id||
  (!w.routine_id&&w.title?.trim().toLowerCase()===routine.title.trim().toLowerCase()));
}
export function filterWorkouts(workouts,start,end){
 return workouts.filter(w=>{const date=day(w);return date>=start&&date<=end;})
  .sort((a,b)=>Date.parse(a.start_time)-Date.parse(b.start_time));
}
export function monday(date){const d=new Date(date+'T12:00:00Z');d.setUTCDate(d.getUTCDate()-((d.getUTCDay()+6)%7));return d.toISOString().slice(0,10);}
export function addDays(date,n){const d=new Date(date+'T12:00:00Z');d.setUTCDate(d.getUTCDate()+n);return d.toISOString().slice(0,10);}
export function weeksBetween(start,end){let w=monday(start),out=[];while(w<=end){out.push({start:w,end:addDays(w,6),partial:w<start||addDays(w,6)>end});w=addDays(w,7);}return out;}
export function validateSnapshot(s){
 if(!Array.isArray(s.workouts)||!Array.isArray(s.routines)||!s.metadata?.captured_at||!s.metadata?.schedule?.sessions_per_week||!Array.isArray(s.metadata.unilateral_rules))throw new Error('Istantanea incompleta: workouts, routines e metadata richiesti.');
 for(const [name,items]of [['workouts',s.workouts],['routines',s.routines]]){
  const ids=new Set();for(const item of items){if(!item.id||ids.has(item.id)||!Array.isArray(item.exercises))throw new Error(name+': ID duplicato o struttura non valida');ids.add(item.id);
   for(const e of item.exercises){if(!e.exercise_template_id||!Array.isArray(e.sets))throw new Error('Esercizio non valido');for(const set of e.sets){if(!['warmup','normal','failure','dropset'].includes(set.type))throw new Error('Tipo serie non valido');for(const k of ['reps','weight_kg','rpe'])if(set[k]!=null&&(!Number.isFinite(set[k])||set[k]<0))throw new Error('Metrica serie non valida');if(set.rpe!=null&&set.rpe>10)throw new Error('RPE non valido');}}
   if(name==='workouts'&&(!Number.isFinite(Date.parse(item.start_time))||!Number.isFinite(Date.parse(item.end_time))||minutes(item)<0))throw new Error('Date allenamento non valide');
  }
 }
 return true;
}
