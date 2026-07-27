class ThemeService {
  constructor(app){this.app=app;matchMedia('(prefers-color-scheme: dark)').addEventListener('change',()=>this.apply())}
  apply(){const s=this.app.settings;const dark=s.theme==='dark'||(s.theme==='auto'&&matchMedia('(prefers-color-scheme: dark)').matches);document.documentElement.classList.toggle('dark',dark);document.documentElement.style.setProperty('--accent',s.accent);document.documentElement.style.setProperty('--blur',`${s.blur}px`);document.documentElement.style.setProperty('--surface',dark?`rgba(35,38,46,${Number(s.transparency)/100})`:`rgba(255,255,255,${Number(s.transparency)/100})`)}
}
