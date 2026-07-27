class SearchService {
  constructor(app){this.app=app;this.query='';this.input=document.querySelector('#searchInput');this.input.addEventListener('input',()=>{this.query=this.input.value.toLowerCase().trim();this.app.renderContent()})}
  matches(site){if(!this.query)return true;const folder=this.app.folders.find(f=>f.id===site.folderId);return [site.name,site.url,site.description,folder?.name].some(v=>(v||'').toLowerCase().includes(this.query))}
  focus(){this.input.focus();this.input.select()}
}
