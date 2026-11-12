/** Documentary cells chosen automatically from the ODJ table section.
 * They are not CSP validation notes and never change GF/NR calculations.
 */
export type CspAnnotationField='movementReason'|'observations';
export function annotationForCspKind(kind:string):CspAnnotationField|undefined{
 if(kind==='reclassement'||kind==='mesure')return 'movementReason';
 if(['admission','titularisation','mutation','avancement'].includes(kind))return 'observations';
 return undefined;
}
