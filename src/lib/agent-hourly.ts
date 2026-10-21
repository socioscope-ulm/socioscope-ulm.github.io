// Payroll basis: 35 hours × 52 weeks; excludes the thirteenth month.
export const ANNUAL_HOURS=35*52;
export const MONTHLY_HOURS=ANNUAL_HOURS/12;
type PayrollRow={monthlyCents:number|null;annualBonusCents:number|null};
export function hourlyRates(rows:PayrollRow[],months=13){
 if(months!==12&&months!==13)throw Error('Annualisation attendue sur 12 ou 13 mois.');
 const covered=rows.filter(r=>r.monthlyCents!==null&&Number.isFinite(r.monthlyCents));
 const withBonuses=covered.filter(r=>r.annualBonusCents!==null&&Number.isFinite(r.annualBonusCents));
 const rate=(population:PayrollRow[],bonuses:boolean)=>population.length?population.reduce((sum,r)=>sum+r.monthlyCents!*12+(bonuses?r.annualBonusCents!:0),0)/100/(population.length*ANNUAL_HOURS):null;
 return {hours:ANNUAL_HOURS,monthlyHours:MONTHLY_HOURS,months:12,withoutBonuses:rate(covered,false),withBonuses:rate(withBonuses,true),covered:covered.length,bonusCovered:withBonuses.length,excluded:rows.length-covered.length,bonusUnknown:covered.length-withBonuses.length};
}
