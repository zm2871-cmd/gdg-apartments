'use client';

import {useEffect,useState,type FormEvent} from 'react';
import Link from 'next/link';
import {useRouter} from 'next/navigation';
import {categories,labels,defaultWeights} from '@/lib/domain';

type LeaseDocument={id:string;status:string;created_at:string};

export default function Account(){
  const router=useRouter();
  const [email,setEmail]=useState('');
  const [token,setToken]=useState('');
  const [codeSent,setCodeSent]=useState(false);
  const [busy,setBusy]=useState(false);
  const [user,setUser]=useState<string|null>(null);
  const [status,setStatus]=useState('');
  const [documents,setDocuments]=useState<LeaseDocument[]>([]);
  const [preferences,setPreferences]=useState(defaultWeights);

  useEffect(()=>{
    if(new URLSearchParams(window.location.search).get('error')==='signin'){
      setStatus('That sign-in link is invalid or expired. Request a new code.');
    }
    fetch('/api/account').then(r=>r.json()).then(d=>{
      if(d.email){
        setUser(d.email);
        if(d.preferences?.pests!==undefined)setPreferences(d.preferences);
        fetch('/api/leases').then(r=>r.json()).then(d=>setDocuments(d.documents??[]));
      }
    }).catch(()=>setStatus('Account service unavailable.'));
  },[]);

  async function requestCode(e:FormEvent<HTMLFormElement>){
    e.preventDefault();
    setBusy(true);
    setStatus('Sending your sign-in code…');
    try{
      const response=await fetch('/api/auth',{
        method:'POST',
        headers:{'Content-Type':'application/json'},
        body:JSON.stringify({email}),
      });
      const result=await response.json();
      if(response.ok){
        setToken('');
        setCodeSent(true);
        setStatus(result.message??'Check your email for a six-digit sign-in code.');
      }else{
        setStatus(result.error?.message??'Unable to send a code. Please try again.');
      }
    }catch{
      setStatus('Account service unavailable.');
    }finally{
      setBusy(false);
    }
  }

  async function verifyCode(e:FormEvent<HTMLFormElement>){
    e.preventDefault();
    setBusy(true);
    setStatus('Checking your code…');
    try{
      const response=await fetch('/api/auth',{
        method:'PUT',
        headers:{'Content-Type':'application/json'},
        body:JSON.stringify({email,token}),
      });
      if(response.ok){
        router.push('/saved');
        return;
      }
      const result=await response.json();
      setStatus(result.error?.message??'That code is invalid or expired. Request a new code.');
    }catch{
      setStatus('Account service unavailable.');
    }finally{
      setBusy(false);
    }
  }

  return <div className="page">
    <div className="page-heading">
      <div className="eyebrow">YOUR RESEARCH, TOGETHER</div>
      <h1>{user?'Your account':'Welcome to AptSignal.'}</h1>
      <p>{user?user:'Sign in with a six-digit email code to save reports and privately review leases.'}</p>
    </div>
    {!user?<section className="panel prose">
      <h2>A code. No password to remember.</h2>
      {!codeSent?<form className="form-stack" onSubmit={requestCode}>
        <label>Email address
          <input className="field" type="email" value={email} required
            onChange={e=>setEmail(e.target.value)} autoComplete="email"/>
        </label>
        <button className="button" disabled={busy}>Email me a sign-in code</button>
      </form>:<>
        <p>We sent a six-digit code to <strong>{email}</strong>. Enter it below.</p>
        <form className="form-stack" onSubmit={verifyCode}>
          <label>Sign-in code
            <input className="field" type="text" inputMode="numeric" autoComplete="one-time-code"
              pattern="[0-9]{6}" maxLength={6} minLength={6} required value={token}
              onChange={e=>setToken(e.target.value.replace(/\D/g,'').slice(0,6))}/>
          </label>
          <button className="button" disabled={busy}>Sign in</button>
        </form>
        <button className="button secondary" type="button" disabled={busy}
          onClick={()=>{setCodeSent(false);setToken('');setStatus('');}}>
          Use a different email or request a new code
        </button>
      </>}
      <p style={{marginTop:20}}>You can search public records without signing in.</p>
      <Link href="/building/demo-1">Explore a demo report →</Link>
    </section>:<>
      <div className="actions">
        <Link className="button" href="/saved">Open saved research</Link>
        <button className="button secondary" onClick={async()=>{
          await fetch('/api/auth',{method:'DELETE'});
          location.reload();
        }}>Sign out</button>
      </div>
      <section className="panel">
        <h2>Your default priorities</h2>
        <div className="weights">{categories.map(c=><label key={c}>{labels[c]} · {preferences[c]}
          <input type="range" min="0" max="5" value={preferences[c]}
            onChange={e=>setPreferences({...preferences,[c]:Number(e.target.value)})}/>
        </label>)}</div>
        <button className="button" onClick={async()=>{
          const r=await fetch('/api/account',{
            method:'PATCH',
            headers:{'Content-Type':'application/json'},
            body:JSON.stringify(preferences),
          });
          setStatus(r.ok?'Preferences saved.':'Unable to save preferences.');
        }}>Save preferences</button>
      </section>
      <section className="panel" style={{marginTop:22}}>
        <h2>Your private documents</h2>
        {documents.length?documents.map(d=><div className="record" key={d.id}>
          <Link href={'/lease-checker/'+d.id}>
            Lease uploaded {new Date(d.created_at).toLocaleDateString()} · {d.status} →
          </Link>
        </div>):<p>No private leases uploaded.</p>}
        <Link className="text-link" href="/lease-checker">Upload a lease →</Link>
      </section>
      <section className="panel" style={{marginTop:22}}>
        <h2>Delete your account</h2>
        <p>This permanently removes your saved research, documents, and account.</p>
        <button className="remove" onClick={async()=>{
          if(prompt('Type DELETE to permanently delete your account and documents.')!=='DELETE')return;
          const r=await fetch('/api/account',{
            method:'DELETE',
            headers:{'Content-Type':'application/json'},
            body:JSON.stringify({confirm:'DELETE'}),
          });
          if(r.ok)location.reload();
          else setStatus('Deletion did not finish. Please retry; remaining files are still private.');
        }}>Delete account and private data</button>
      </section>
    </>}
    <p className="status" role="status">{status}</p>
  </div>;
}
