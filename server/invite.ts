// Invitation and recovery links are created on explicit administrator action.
export async function createAccountLink(req:Request,projectURL:string,serviceKey:string,email:string,type:'invite'|'recovery'){
 const r=await fetch(projectURL+'/auth/v1/admin/generate_link',{method:'POST',headers:{apikey:serviceKey,authorization:'Bearer '+serviceKey,'Content-Type':'application/json'},body:JSON.stringify({type,email,redirect_to:'https://fnme-pointage.github.io/socioscope-ulm/'})});const b=await r.json();if(!r.ok)return Response.json({error:'Le lien ne peut pas être créé. Vérifier si le compte existe déjà et choisir le type de lien adapté.'},{status:400});return Response.json({link:b.action_link});
}
