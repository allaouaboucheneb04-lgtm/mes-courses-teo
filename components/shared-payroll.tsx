"use client";
import {useEffect,useState} from "react";
const CACHE="mes-courses-teo-shared-pdf-v1";
type Pending={key:string;file:File};
export default function SharedPayroll({email,disabled,onImport}:{email:string;disabled:boolean;onImport:(file:File)=>Promise<boolean|undefined>}){
  const [pending,setPending]=useState<Pending[]>([]);
  const [busy,setBusy]=useState("");
  const [error,setError]=useState("");
  useEffect(()=>{
    let cancelled=false;
    async function read(){
      try{
        if(!("caches" in window)) return;
        const cache=await caches.open(CACHE);
        const items:Pending[]=[];
        for(const key of await cache.keys()){
          const response=await cache.match(key);
          if(!response) continue;
          if(Date.now()-Number(response.headers.get("X-Shared-At"))>86400000){await cache.delete(key);continue;}
          const blob=await response.blob();
          items.push({key:key.url,file:new File([blob],decodeURIComponent(response.headers.get("X-File-Name")||"Fiche-Teo.pdf"),{type:"application/pdf"})});
        }
        if(!cancelled)setPending(items);
      }catch{if(!cancelled)setError("Impossible de récupérer le PDF partagé. Utilisez le bouton de sélection du fichier ci-dessous.");}
    }
    void read();
    window.addEventListener("focus",read);
    return ()=>{cancelled=true;window.removeEventListener("focus",read);};
  },[]);
  async function remove(item:Pending){
    await (await caches.open(CACHE)).delete(item.key);
    setPending(current=>current.filter(p=>p.key!==item.key));
  }
  return <>
    {!!pending.length && <section className="shared-payroll"><h3>PDF reçus par partage</h3><p>Compte : {email}. Choisissez la fiche à vérifier.</p>{pending.map(item=><article key={item.key}><b>{item.file.name}</b><small>{Math.ceil(item.file.size/1024)} ko</small><div><button type="button" disabled={disabled||!!busy} onClick={async()=>{setBusy(item.key);setError("");try{if(await onImport(item.file))await remove(item);}catch{setError("Le traitement n’a pas abouti. Réessayez ou choisissez le PDF ci-dessous.");}finally{setBusy("");}}}>{busy===item.key ? "Lecture…" : "Vérifier ce PDF"}</button><button type="button" disabled={disabled||!!busy} onClick={async()=>{try{await remove(item);}catch{setError("Impossible de retirer le fichier temporaire.");}}}>Retirer</button></div></article>)}<small>Les PDF en attente restent sur cet appareil. Ils sont retirés après import et les fichiers de plus de 24 h sont supprimés à la prochaine ouverture de cette liste.</small></section>}
    {error && <p className="error-box" role="alert">{error}</p>}
    <details className="pay-share-help"><summary>Recevoir une fiche depuis Gmail, Mail ou Fichiers</summary><p><b>Android :</b> installez Mes courses Téo depuis Chrome, ouvrez le PDF puis choisissez Partager → Mes courses. La fiche arrive ici, prête à vérifier. Si l’application n’apparaît pas, ouvrez-la en ligne pour recevoir la mise à jour puis réessayez plus tard.</p><p><b>iPhone / iPad :</b> dans le menu Partager du PDF, choisissez « Enregistrer dans Fichiers ». Revenez ici et touchez « Choisir la fiche PDF Téo » pour sélectionner le document. La version web installée ne peut pas recevoir directement le partage iOS.</p><p>Partage Android : jusqu’à 5 PDF, 20 Mo par fichier, 50 Mo au total.</p></details>
  </>;
}
