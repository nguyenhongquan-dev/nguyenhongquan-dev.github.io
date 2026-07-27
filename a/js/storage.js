class StorageService {
  constructor(){this.key='fluent-dashboard-data';this.settingsKey='fluent-dashboard-settings'}
  get defaults(){return {workspaces:[{id:'default',name:'Personal',icon:'◈',color:'#3977ed'}],activeWorkspaceId:'default',folders:[{id:'general',workspaceId:'default',name:'General',color:'#3977ed',icon:'▣',collapsed:false,order:0},{id:'learning',workspaceId:'default',name:'Learning',color:'#8b5cf6',icon:'◉',collapsed:false,order:1},{id:'work',workspaceId:'default',name:'Office',color:'#10a37f',icon:'▤',collapsed:false,order:2}],websites:[]}}
  load(){try{const data=JSON.parse(localStorage.getItem(this.key));if(!data||!Array.isArray(data.websites))return this.defaults;if(!data.workspaces){data.workspaces=[{id:'default',name:'Personal',icon:'◈',color:'#3977ed'}];data.activeWorkspaceId='default';data.folders.forEach(f=>f.workspaceId='default');data.websites.forEach(w=>w.workspaceId='default')}return data}catch{return this.defaults}}
  save(data){localStorage.setItem(this.key,JSON.stringify(data))}
  settings(){try{return {...{theme:'auto',accent:'#3977ed',blur:18,transparency:75,view:'grid',sort:'manual',language:'en'},...JSON.parse(localStorage.getItem(this.settingsKey))}}catch{return {theme:'auto',accent:'#3977ed',blur:18,transparency:75,view:'grid',sort:'manual',language:'en'}}}
  saveSettings(settings){localStorage.setItem(this.settingsKey,JSON.stringify(settings))}
  reset(){localStorage.removeItem(this.key);localStorage.removeItem(this.settingsKey)}
}
