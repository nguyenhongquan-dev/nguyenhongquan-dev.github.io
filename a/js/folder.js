class FolderService {
  constructor(app){this.app=app}
  create(values){const folder={id:crypto.randomUUID(),workspaceId:this.app.workspaceId,name:values.name.trim(),color:values.color||'#3977ed',icon:values.icon||'▣',collapsed:false,order:this.app.data.folders.length};this.app.data.folders.push(folder);this.app.persist();return folder}
  update(id,values){Object.assign(this.find(id),values);this.app.persist()}
  find(id){return this.app.data.folders.find(f=>f.id===id)}
  remove(id){const fallback=this.app.folders.find(f=>f.id!==id)?.id||'';this.app.data.websites.forEach(w=>{if(w.folderId===id)w.folderId=fallback});this.app.data.folders=this.app.data.folders.filter(f=>f.id!==id);this.app.persist()}
}
