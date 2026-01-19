// SLL360 SRAT — Split React Component Files (single document showing multiple files)
// Guidance: Copy each file block into the named file inside a Create React App project.
// File list (create these under src/):
// - index.js
// - App.jsx
// - components/Login.jsx
// - components/Dashboard.jsx
// - components/RequestForm.jsx
// - components/RequestCard.jsx
// - components/TemplateEditor.jsx
// - lib/storage.js
// - index.css

/* ==================================================
   src/index.js
   Entry point
   ==================================================*/

// src/index.js
import React from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import './index.css';

const root = createRoot(document.getElementById('root'));
root.render(<App />);

/* ==================================================
   src/App.jsx
   Main app container: handles auth state, routing between Login & Dashboard
   ==================================================*/

// src/App.jsx
import React, { useEffect, useState } from 'react';
import Login from './components/Login';
import Dashboard from './components/Dashboard';
import { loadAll, saveAll, seedDemo } from './lib/storage';

export default function App() {
  const [db, setDb] = useState(() => loadAll());
  const [user, setUser] = useState(null);

  useEffect(() => saveAll(db), [db]);

  // Ensure demo data seeded once
  useEffect(() => {
    if (!db._seeded) {
      const seeded = seedDemo();
      setDb(seeded);
    }
  }, []);

  function updateDb(patch) {
    setDb(prev => ({ ...prev, ...patch }));
  }

  return (
    <div className="app-root">
      {!user ? (
        <Login db={db} onLogin={u => setUser(u)} />
      ) : (
        <Dashboard db={db} updateDb={updateDb} user={user} onLogout={() => setUser(null)} />
      )}
    </div>
  );
}

/* ==================================================
   src/components/Login.jsx
   Simple login form with seeded users; returns user object on success
   ==================================================*/

// src/components/Login.jsx
import React, { useState } from 'react';

export default function Login({ db, onLogin }) {
  const [form, setForm] = useState({ username: '', password: '' });

  function handleSubmit(e) {
    e.preventDefault();
    const u = (db.users || []).find(x => x.username === form.username && x.password === form.password);
    if (!u) return alert('Invalid credentials — try seeded: admin/admin123');
    onLogin(u);
  }

  return (
    <div className="login-card">
      <div className="brand">SLL360 SRAT</div>
      <form onSubmit={handleSubmit} className="login-form">
        <label>Username<input value={form.username} onChange={e => setForm({ ...form, username: e.target.value })} /></label>
        <label>Password<input type="password" value={form.password} onChange={e => setForm({ ...form, password: e.target.value })} /></label>
        <div className="row">
          <button className="btn primary">Login</button>
          <button type="button" className="btn" onClick={() => alert('Demo users: admin/admin123, pi/pi123, fac/fac123, coord1/coord123, field1/field123, finance/finance123')}>Demo users</button>
        </div>
      </form>
    </div>
  );
}

/* ==================================================
   src/components/Dashboard.jsx
   The main app UI after login. Contains sidebar, request list, templates and admin actions.
   ==================================================*/

// src/components/Dashboard.jsx
import React, { useState } from 'react';
import RequestForm from './RequestForm';
import RequestCard from './RequestCard';
import TemplateEditor from './TemplateEditor';

export default function Dashboard({ db, updateDb, user, onLogout }) {
  const [filter, setFilter] = useState({ funder: 'All', status: 'All', program: '' });

  // Helper: visible requests based on role
  function visibleRequests() {
    const all = db.requests || [];
    if (user.role === 'PI' || user.role === 'Admin' || user.role === 'Finance') return all;
    if (user.role === 'Facilitator') return all;
    if (user.role === 'Coordinator') return all.filter(r => (user.fundSources || []).includes(r.funder));
    if (user.role === 'Field Staff') return all.filter(r => r.createdBy === user.id);
    return [];
  }

  function saveRequest(newReq) {
    updateDb({ requests: [newReq, ...(db.requests || [])] });
  }

  function patchRequest(id, patch) {
    const next = (db.requests || []).map(r => r.id === id ? { ...r, ...patch } : r);
    updateDb({ requests: next });
  }

  function addUser(newUser) {
    updateDb({ users: [newUser, ...(db.users || [])] });
  }

  return (
    <div className="dashboard">
      <aside className="sidebar">
        <div className="brand-small">SLL360 SRAT</div>
        <div className="user-info">{user.name} <small>({user.role})</small></div>
        <nav>
          <button className="btn" onClick={onLogout}>Logout</button>
        </nav>

        {user.role === 'Admin' && (
          <div className="admin-area">
            <h4>Admin</h4>
            <TemplateEditor templates={db.templates} onSave={t => updateDb({ templates: t })} />
            <h5>Create user</h5>
            <CreateUserForm onCreate={addUser} />
          </div>
        )}
      </aside>

      <main className="main">
        <header className="main-header">
          <h2>Requests</h2>
          <div className="filters">
            <select value={filter.funder} onChange={e => setFilter({ ...filter, funder: e.target.value })}>
              <option>All</option>
              <option>FunderA</option>
              <option>FunderB</option>
            </select>
            <select value={filter.status} onChange={e => setFilter({ ...filter, status: e.target.value })}>
              <option>All</option>
              <option>Pending Facilitator</option>
              <option>Pending Coordinator</option>
              <option>Pending PI</option>
              <option>Approved for Finance</option>
              <option>Paid</option>
              <option>Rejected</option>
            </select>
          </div>
        </header>

        <section className="submit-area">
          {user.role === 'Field Staff' && <RequestForm templates={db.templates} user={user} onSubmit={saveRequest} />}
        </section>

        <section className="list-area">
          {visibleRequests().filter(r => (filter.funder === 'All' || r.funder === filter.funder) && (filter.status === 'All' || r.status === filter.status)).map(r => (
            <RequestCard key={r.id} r={r} onPatch={patchRequest} db={db} user={user} />
          ))}
        </section>
      </main>
    </div>
  );
}

/* small CreateUserForm component used in Dashboard */
function CreateUserForm({ onCreate }) {
  const [f, setF] = useState({ username: '', password: '', name: '', role: 'Field Staff', email: '', phone: '', nationalId: '', driverLicense: '', passport: '', fundSources: '' });
  function submit(e) {
    e.preventDefault();
    // require at least one ID among three
    if (!f.nationalId && !f.driverLicense && !f.passport) return alert('Provide at least one ID (national, driver, or passport)');
    const user = { id: uid(), username: f.username, password: f.password || 'changeme', name: f.name || f.username, role: f.role, email: f.email, phone: f.phone };
    if (f.role === 'Coordinator') user.fundSources = f.fundSources.split(',').map(s => s.trim());
    onCreate(user);
    setF({ username: '', password: '', name: '', role: 'Field Staff', email: '', phone: '', nationalId: '', driverLicense: '', passport: '', fundSources: '' });
  }
  return (
    <form onSubmit={submit} className="small-form">
      <input placeholder="username" value={f.username} onChange={e => setF({ ...f, username: e.target.value })} />
      <input placeholder="Full name" value={f.name} onChange={e => setF({ ...f, name: e.target.value })} />
      <select value={f.role} onChange={e => setF({ ...f, role: e.target.value })}><option>Field Staff</option><option>Coordinator</option><option>PI</option><option>Facilitator</option><option>Finance</option></select>
      <input placeholder="Fund sources (comma separated) for coordinator" value={f.fundSources} onChange={e => setF({ ...f, fundSources: e.target.value })} />
      <div><button className="btn small">Create</button></div>
    </form>
  );
}

/* ==================================================
   src/components/RequestForm.jsx
   Build multi-item request using templates; submit combined request
   ==================================================*/

// src/components/RequestForm.jsx
import React, { useState } from 'react';

export default function RequestForm({ templates, user, onSubmit }) {
  const [items, setItems] = useState([]);
  const [newItem, setNewItem] = useState({ category: Object.keys(templates)[0], amount: '', templateData: {} });
  const [meta, setMeta] = useState({ funder: 'FunderA', program: 'General', notes: '' });

  function addItem() {
    if (!newItem.category) return alert('choose category');
    const it = { id: uid(), category: newItem.category, amount: Number(newItem.amount) || 0, templateData: newItem.templateData };
    setItems([it, ...items]);
    setNewItem({ category: newItem.category, amount: '', templateData: {} });
  }

  function submit(e) {
    e.preventDefault();
    if (items.length === 0) return alert('Add at least one item');
    const request = { id: uid(), createdAt: now(), createdBy: user.id, createdByName: user.name, items, funder: meta.funder, program: meta.program, overallNotes: meta.notes, status: 'Pending Facilitator', history: [{ who: user.name, role: user.role, action: 'Submitted', at: now() }], files: [], approvalLetter: null, signatures: {}, reimbursed: 0 };
    onSubmit(request);
    setItems([]); setMeta({ funder: 'FunderA', program: 'General', notes: '' });
  }

  const tpl = templates[newItem.category] || [];

  return (
    <form className="request-form" onSubmit={submit}>
      <div className="row">
        <label>Funder<select value={meta.funder} onChange={e => setMeta(prev => ({ ...prev, funder: e.target.value }))}><option>FunderA</option><option>FunderB</option></select></label>
        <label>Program<input value={meta.program} onChange={e => setMeta(prev => ({ ...prev, program: e.target.value }))} /></label>
      </div>

      <div className="item-builder">
        <label>Category<select value={newItem.category} onChange={e => setNewItem({ ...newItem, category: e.target.value, templateData: {} })}>{Object.keys(templates).map(k => <option key={k}>{k}</option>)}</select></label>
        <label>Amount<input type="number" value={newItem.amount} onChange={e => setNewItem({ ...newItem, amount: e.target.value })} /></label>

        <div className="template-fields">
          {tpl.map(f => (
            <div key={f.key} className="field-row">
              <label>{f.label}{f.type!=='textarea' ? <input value={newItem.templateData[f.key]||''} onChange={e => setNewItem(prev => ({ ...prev, templateData: { ...prev.templateData, [f.key]: e.target.value } }))} /> : <textarea value={newItem.templateData[f.key]||''} onChange={e => setNewItem(prev => ({ ...prev, templateData: { ...prev.templateData, [f.key]: e.target.value } }))} />}</label>
            </div>
          ))}
        </div>

        <div><button type="button" className="btn" onClick={addItem}>Add item</button></div>
      </div>

      <div className="items-preview">
        {items.map(it => (
          <div key={it.id} className="item-row"><strong>{it.category}</strong> — {it.amount} ETB<button className="tiny" onClick={() => setItems(items.filter(x=>x.id!==it.id))}>Remove</button><div className="small">{Object.entries(it.templateData||{}).map(([k,v])=> <div key={k}><strong>{k}:</strong> {v}</div>)}</div></div>
        ))}
      </div>

      <div><label>Notes<textarea value={meta.notes} onChange={e => setMeta(prev => ({ ...prev, notes: e.target.value }))} /></label></div>
      <div><button className="btn primary" type="submit">Submit Request</button></div>
    </form>
  );
}

/* ==================================================
   src/components/RequestCard.jsx
   Displays single request, files, approval letter, signatures and actions (based on user role)
   ==================================================*/

// src/components/RequestCard.jsx
import React, { useRef, useState } from 'react';

export default function RequestCard({ r, onPatch, db, user }) {
  const [expanded, setExpanded] = useState(false);
  const canvasRef = useRef(null);
  const [editedLetter, setEditedLetter] = useState(r.approvalLetter || '');

  function uploadFile(e) {
    const f = e.target.files[0];
    if (!f) return;
    const reader = new FileReader();
    reader.onload = () => onPatch(r.id, { files: [{ name: f.name, dataUrl: reader.result }, ...(r.files || [])] });
    reader.readAsDataURL(f);
  }

  function doForward() { onPatch(r.id, { status: 'Pending Coordinator', history: [...r.history, { who: user.name, role: user.role, action: 'Forwarded', at: now() }] }); }
  function doCoordApprove() { onPatch(r.id, { status: 'Pending PI', history: [...r.history, { who: user.name, role: user.role, action: 'Coordinator approved', at: now() }] }); }
  function doPiApprove() { onPatch(r.id, { status: 'Approved for Finance', approvalLetter: editedLetter || defaultLetter(r, user), history: [...r.history, { who: user.name, role: user.role, action: 'PI approved', at: now() }] }); }
  function doFinancePaid() { const amt = Number(prompt('Paid amount', r.reimbursed || totalAmount(r))); if (isNaN(amt)) return; onPatch(r.id, { status: 'Paid', reimbursed: amt, history: [...r.history, { who: user.name, role: user.role, action: `Finance paid ${amt}`, at: now() }] }); }
  function doReject() { const reason = prompt('Reason'); if (!reason) return; onPatch(r.id, { status: 'Rejected', history: [...r.history, { who: user.name, role: user.role, action: `Rejected: ${reason}`, at: now() }] }); }

  // signature canvas
  function saveSignature() {
    const c = canvasRef.current; if (!c) return; const data = c.toDataURL(); onPatch(r.id, { signatures: { ...(r.signatures||{}), [user.role||user.username]: data } }); alert('Saved signature (demo)'); }
  function clearCanvas() { const c = canvasRef.current; if (!c) return; const ctx = c.getContext('2d'); ctx.clearRect(0,0,c.width,c.height); }

  const canForward = user.role === 'Facilitator' && r.status === 'Pending Facilitator';
  const canCoord = user.role === 'Coordinator' && r.status === 'Pending Coordinator' && (user.fundSources||[]).includes(r.funder);
  const canPI = user.role === 'PI' && r.status === 'Pending PI';
  const canFin = user.role === 'Finance' && r.status === 'Approved for Finance';

  return (
    <div className="request-card">
      <div className="row between">
        <div><strong>{r.id}</strong> — {r.funder} — {r.program}</div>
        <div>{r.createdByName} • <span className="status">{r.status}</span></div>
      </div>

      <div className="row">
        <div>Items: {r.items.length} • Total: {totalAmount(r)} ETB</div>
        <div><button onClick={() => setExpanded(s => !s)} className="btn tiny">{expanded ? 'Hide' : 'Details'}</button></div>
      </div>

      {expanded && (
        <div className="expanded">
          <table className="items-table"><thead><tr><th>Category</th><th>Amount</th><th>Details</th></tr></thead><tbody>{r.items.map(it => <tr key={it.id}><td>{it.category}</td><td>{it.amount}</td><td>{Object.entries(it.templateData||{}).map(([k,v])=> <div key={k}><strong>{k}:</strong> {v}</div>)}</td></tr>)}</tbody></table>

          <div className="files">{(r.files||[]).map((f,i)=>(<div key={i}><a href={f.dataUrl} target="_blank" rel="noreferrer">{f.name}</a></div>))}</div>
          <div>Upload supporting file: <input type="file" onChange={uploadFile} /></div>

          <div className="letter">Approval letter (PI / Admin can edit):<div contentEditable={(user.role==='PI' || user.role==='Admin')} onInput={e=>setEditedLetter(e.currentTarget.innerText)} className="letter-box">{r.approvalLetter||'(no letter yet)'}</div>
            {(user.role==='PI' || user.role==='Admin') && <button onClick={()=>doPiApprove()} className="btn small">Save & Approve to Finance</button>}
          </div>

          <div className="signatures">
            <div>Sign here (draw)</div>
            <canvas ref={canvasRef} width={300} height={120} style={{ border:'1px solid #ccc' }} onMouseDown={startDrawing} onMouseUp={stopDrawing} onMouseMove={draw}></canvas>
            <div><button onClick={saveSignature} className="btn small">Save signature</button><button onClick={clearCanvas} className="btn small">Clear</button></div>
            <div>Saved signatures: {(r.signatures && Object.entries(r.signatures).map(([k,v])=>(<div key={k}><strong>{k}</strong><img src={v} style={{maxWidth:150}} /></div>)))||'None'}</div>
          </div>

          <div className="actions">
            {canForward && <button onClick={doForward} className="btn">Forward to Coordinator</button>}
            {canCoord && <button onClick={doCoordApprove} className="btn">Approve to PI</button>}
            {canPI && <button onClick={doPiApprove} className="btn">PI Approve</button>}
            {canFin && <button onClick={doFinancePaid} className="btn">Mark Paid</button>}
            <button onClick={doReject} className="btn">Reject</button>
          </div>

          <div className="history">History:<ul>{(r.history||[]).map((h,i)=><li key={i}>{h.at} — {h.role} ({h.who}): {h.action}</li>)}</ul></div>
        </div>
      )}
    </div>
  );
}

// drawing helpers for canvas (basic)
function startDrawing(e){ const c=e.target; const ctx=c.getContext('2d'); ctx.isDrawing=true; ctx.lastX=e.offsetX; ctx.lastY=e.offsetY; }
function stopDrawing(e){ const c=e.target; const ctx=c.getContext('2d'); ctx.isDrawing=false; }
function draw(e){ const c=e.target; const ctx=c.getContext('2d'); if(!ctx.isDrawing) return; ctx.strokeStyle='#000'; ctx.lineWidth=2; ctx.beginPath(); ctx.moveTo(ctx.lastX, ctx.lastY); ctx.lineTo(e.offsetX, e.offsetY); ctx.stroke(); ctx.lastX=e.offsetX; ctx.lastY=e.offsetY; }

function totalAmount(r){ return (r.items||[]).reduce((s,it)=>s+(it.amount||0),0); }

/* ==================================================
   src/components/TemplateEditor.jsx
   Small template editor allowing Admin to edit or add fields for a category
   ==================================================*/

// src/components/TemplateEditor.jsx
import React, { useState, useEffect } from 'react';

export default function TemplateEditor({ templates, onSave }) {
  const [local, setLocal] = useState(templates);
  useEffect(()=>setLocal(templates),[templates]);

  function addField(cat){ const copy={...local}; copy[cat]=[...(copy[cat]||[]),{key:'new',label:'New field',type:'text'}]; setLocal(copy); }
  function changeField(cat, idx, key, val){ const copy={...local}; copy[cat][idx]={...copy[cat][idx],[key]:val}; setLocal(copy); }
  function saveAll(){ onSave(local); }

  return (
    <div className="template-editor">
      {Object.keys(local).map(cat=> (
        <div key={cat} className="tpl">
          <h5>{cat}</h5>
          {(local[cat]||[]).map((f,i)=> (
            <div key={i} className="tpl-row"><input value={f.key} onChange={e=>changeField(cat,i,'key',e.target.value)} /> <input value={f.label} onChange={e=>changeField(cat,i,'label',e.target.value)} /> <select value={f.type} onChange={e=>changeField(cat,i,'type',e.target.value)}><option>text</option><option>number</option><option>date</option><option>textarea</option></select></div>
          ))}
          <div><button onClick={()=>addField(cat)} className="btn tiny">Add field</button></div>
        </div>
      ))}
      <div><button onClick={saveAll} className="btn small">Save templates</button></div>
    </div>
  );
}

/* ==================================================
   src/lib/storage.js
   Small helper to persist in localStorage and seed demo data
   ==================================================*/

// src/lib/storage.js
export function loadAll(){
  try{ const raw=localStorage.getItem('sll360_db_v1'); return raw?JSON.parse(raw):{_seeded:false,users:[],templates:{},requests:[]}; }catch(e){ return { _seeded:false, users:[], templates:{}, requests:[] }; }
}
export function saveAll(db){ localStorage.setItem('sll360_db_v1', JSON.stringify(db)); }

export function seedDemo(){
  const users=[ { id: 'u1', username:'admin', password:'admin123', role:'Admin', name:'Admin' }, { id:'u2', username:'pi', password:'pi123', role:'PI', name:'PI' }, { id:'u3', username:'fac', password:'fac123', role:'Facilitator', name:'Facilitator' }, { id:'u4', username:'coord1', password:'coord123', role:'Coordinator', name:'Coord NICU', fundSources:['FunderA'] }, { id:'u5', username:'field1', password:'field123', role:'Field Staff', name:'Field Worker A' }, { id:'u6', username:'finance', password:'finance123', role:'Finance', name:'Finance' } ];
  const templates = { Fuel:[{key:'vehicle_no',label:'Vehicle no',type:'text'},{key:'litres',label:'Litres',type:'number'}], 'Per diem':[ {key:'traveller',label:'Traveller',type:'text'},{key:'days',label:'Days',type:'number'} ], 'Air ticket':[ {key:'passenger',label:'Passenger',type:'text'} ], Other:[{key:'details',label:'Details',type:'textarea'}] };
  const db = { _seeded:true, users, templates, requests:[] };
  localStorage.setItem('sll360_db_v1', JSON.stringify(db));
  return db;
}

/* small helpers used across components */
export function uid(){ return Math.random().toString(36).slice(2,9); }
export function now(){ return new Date().toISOString(); }

/* ==================================================
   src/index.css
   Minimal styles to make UI readable
   ==================================================*/

/* src/index.css */
:root{ --pink:#d63384; --pink-50:#fff5f7; }
body{ margin:0; font-family:Inter,system-ui,Arial,Helvetica,sans-serif; background:var(--pink-50); }
.app-root{ padding:16px; }
.login-card{ max-width:420px; margin:40px auto; background:#fff; padding:18px; border-radius:8px; box-shadow:0 6px 18px rgba(0,0,0,0.06); }
.brand{ font-size:20px; color:var(--pink); font-weight:600; margin-bottom:12px; }
.login-form label{ display:block; margin-bottom:8px; }
.login-form input{ width:100%; padding:8px; border-radius:6px; border:1px solid #eee; }
.btn{ padding:8px 10px; border-radius:6px; background:#eee; border:none; cursor:pointer; }
.btn.primary{ background:var(--pink); color:#fff; }
.small{ padding:6px 8px; }
.tiny{ padding:4px 6px; font-size:12px; }
.dashboard{ display:grid; grid-template-columns:260px 1fr; gap:12px; }
.sidebar{ background:#fff; padding:12px; border-radius:8px; }
.main{ background:#fff; padding:12px; border-radius:8px; }
.request-form .row{ display:flex; gap:8px; }
.request-form input, textarea, select{ width:100%; padding:6px; border-radius:6px; border:1px solid #eee; }
.request-card{ border:1px solid #fde6f0; padding:10px; border-radius:6px; margin-bottom:8px; }
.status{ background:#fde6f0; color:var(--pink); padding:2px 6px; border-radius:4px; }

/* ==================================================
   Instructions
   ==================================================
1) Create a new CRA project: `npx create-react-app sll360-srat`.
2) Replace the files in src/ with the files shown above (create folders `components` and `lib`).
3) Run `npm start`.
4) Use seeded users (admin/admin123 etc.) to explore.

If you want, I can paste each file separately into the chat so you can copy-paste them easily — say "paste files" and I'll output each file in its own code block for you to copy.
