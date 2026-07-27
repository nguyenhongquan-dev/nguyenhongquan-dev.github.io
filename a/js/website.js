class WebsiteService {
  constructor(app){this.app=app}
  create(values){const now=Date.now();const site={id:crypto.randomUUID(),workspaceId:this.app.workspaceId,name:values.name.trim(),url:this.normalUrl(values.url),description:values.description||'',icon:values.icon||'',iconType:values.iconType||'favicon',displayType:values.displayType||'Card',background:values.background||'#eaf1ff',textColor:values.textColor||'#3977ed',favorite:false,pinned:false,createdAt:now,modifiedAt:now,lastUsed:0,useCount:0,folderId:values.folderId||this.app.folders[0]?.id||'',order:this.app.data.websites.length};this.app.data.websites.push(site);this.app.persist();return site}
  update(id,values){const site=this.find(id);Object.assign(site,{...values,url:this.normalUrl(values.url),modifiedAt:Date.now()});this.app.persist()}
  find(id){return this.app.data.websites.find(w=>w.id===id)}
  duplicate(id){const source=this.find(id);const copy={...source,id:crypto.randomUUID(),name:`${source.name} copy`,createdAt:Date.now(),modifiedAt:Date.now(),order:this.app.data.websites.length};this.app.data.websites.push(copy);this.app.persist()}
  remove(id){this.app.data.websites=this.app.data.websites.filter(w=>w.id!==id);this.app.persist()}
  normalUrl(url){if(!url)return '';return /^https?:\/\//i.test(url)?url:`https://${url}`}
  favicon(site){try{return `https://www.google.com/s2/favicons?domain=${encodeURIComponent(new URL(site.url).hostname)}&sz=128`}catch{return ''}}
}
