export function modules(plannerUrl:string) {
  return [
    {id:'home',name:'Übersicht',symbol:'⌂',href:'/',external:false,description:''},
    {id:'wishlist',name:'Wunschliste',symbol:'♡',href:'/wunschliste',external:false,description:'Wünsche schnell festhalten und später wiederfinden.'},
    ...(plannerUrl ? [{id:'planner',name:'Hausaufgabenplaner',symbol:'▤',href:plannerUrl,external:true,description:'Öffne deinen bestehenden Planer.'}] : [])
  ];
}
