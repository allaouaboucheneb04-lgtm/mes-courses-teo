"use client";
import {useRef,useState} from "react";

export default function PastePayroll({disabled,onImport}:{disabled:boolean;onImport:(file:File)=>Promise<boolean|undefined>}){
  const [file,setFile]=useState<File|null>(null);
  const [message,setMessage]=useState("");
  const [busy,setBusy]=useState(false);
  const locked=useRef(false);
  const area=useRef<HTMLTextAreaElement>(null);
  async function accept(files:File[]){
    setFile(null);
    if(files.length!==1){setMessage(files.length ? "Collez une seule fiche PDF à la fois." : "Le téléphone n’a pas transmis le PDF. Copiez le fichier lui-même, pas son texte ou son lien. Sinon, utilisez « Choisir dans Fichiers ».");return;}
    const candidate=files[0];
    if(!candidate.size || candidate.size>20*1024*1024){setMessage("Choisissez un PDF non vide de moins de 20 Mo.");return;}
    if(!(await candidate.slice(0,1024).text()).includes("%PDF-")){setMessage("Le contenu collé n’est pas un fichier PDF. Une image, un lien ou du texte ne remplace pas la fiche PDF.");return;}
    setFile(candidate);
    setMessage("PDF récupéré. Touchez « Vérifier ce PDF » pour lancer l’analyse.");
  }
  async function run(action:()=>Promise<void>){
    if(disabled||locked.current)return;
    locked.current=true;setBusy(true);setMessage("");
    try{await action();}catch{setMessage("Le navigateur n’a pas donné accès au fichier. Faites un appui long dans la zone puis « Coller », ou choisissez le PDF dans Fichiers.");}
    finally{locked.current=false;setBusy(false);}
  }
  return <section className="paste-payroll" aria-label="Coller une fiche PDF">
    <h3>Copier et coller une fiche</h3>
    <p>Copiez le fichier PDF dans Mail, Gmail ou Fichiers, puis collez-le ici.</p>
    <button type="button" disabled={disabled||busy} onClick={()=>{void run(async()=>{
      setFile(null);
      if(!navigator.clipboard?.read){area.current?.focus();setMessage("Faites un appui long dans la zone ci-dessous, puis choisissez « Coller ».");return;}
      const items=await navigator.clipboard.read();
      const files:File[]=[];
      for(const item of items){const type=item.types.find(t=>t === "application/pdf" || t === "application/octet-stream");if(type){const blob=await item.getType(type);files.push(new File([blob],"Fiche-Teo-collee.pdf",{type:"application/pdf"}));}}
      await accept(files);
    });}}>{busy ? "Traitement…" : "📋 Coller un PDF"}</button>
    <label>Zone de collage<textarea ref={area} disabled={disabled||busy} aria-describedby="paste-pdf-help" placeholder="Appui long → Coller, ou Ctrl+V / ⌘V" rows={2} value="" onChange={()=>{}} onPaste={event=>{
      event.preventDefault();
      const files=Array.from(event.clipboardData.files);
      if(!files.length)for(const item of Array.from(event.clipboardData.items)){if(item.kind === "file"){const pasted=item.getAsFile();if(pasted)files.push(pasted);}}
      void run(()=>accept(files));
    }}/></label>
    <small id="paste-pdf-help">Selon l’application et le téléphone, « Copier » peut ne transmettre que du texte ou un lien. Dans ce cas, choisissez le fichier directement.</small>
    {message && <p role="status">{message}</p>}
    {file && <div className="paste-pdf-ready"><b>{file.name}</b><small>{Math.ceil(file.size/1024)} ko</small><button type="button" disabled={disabled||busy} onClick={()=>{void run(async()=>{if(await onImport(file)){setFile(null);setMessage("Fiche importée. Le résultat de la vérification s’affiche ci-dessous.");}else setMessage("Le PDF a été reçu, mais son analyse a échoué. Consultez le message de vérification ci-dessous.");});}}>Vérifier ce PDF</button><button type="button" disabled={disabled||busy} onClick={()=>{setFile(null);setMessage("");}}>Retirer</button></div>}
    <button type="button" disabled={disabled||busy} onClick={()=>document.getElementById("pay-pdf-input")?.click()}>Choisir dans Fichiers</button>
  </section>;
}
