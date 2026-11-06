// Deliberately narrow. Extend this allowlist when integrating additional protected routes.
export function safeDestination(value:unknown){return value==='/dashboard'?'/dashboard':'/dashboard';}
export function isProtectedPath(pathname:string){return pathname==='/dashboard'||pathname.startsWith('/dashboard/');}
export function signInDestination(){return '/sign-in?next=%2Fdashboard';}
