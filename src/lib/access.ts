// Identity headers are supplied by Sites after authentication.
export const ADMIN_EMAIL = 'fnme.pointage@gmail.com';
export function isAdministrator(user: {email?: string|null; userId?: string|null}|null) {
 return !!user?.userId && user.email?.trim().toLowerCase() === ADMIN_EMAIL;
}
export function accessError(request: Request, write = false): Response|null {
 const userId=request.headers.get('oai-authenticated-user-id');
 if(!userId)return Response.json({error:'Connexion requise.'},{status:401});
 if(write && request.headers.get('x-socioscope-role')!=='admin')
  return Response.json({error:'Administration réservée à Stéphane Louvet. Votre accès est en consultation seule.'},{status:403});
 if(write && request.headers.get('origin') && request.headers.get('origin')!==new URL(request.url).origin)
  return Response.json({error:'Origine non autorisée.'},{status:403});
 return null;
}
