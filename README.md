# SRAT-SLL360-test
import React, { useEffect, useState } from "react";

// SLL360 SRAT - Upgraded Single-file React Prototype
// Features implemented (simulated with localStorage):
// - User accounts with username/password and roles (Admin, PI, Coordinator, Facilitator, Field Staff, Finance)
// - Admin can add users and assign fund sources to coordinators
// - Login screen with password
// - Request submission with expense categories and funder source
// - Approval workflow: Field Staff -> Facilitator (notification) -> Coordinator (by fund source) -> PI -> Finance
// - File upload for supporting docs and upload of signed approval letter (stored base64 in localStorage)
// - After final approval, an editable approval-letter template is available and can be printed
// - Role-based dashboards and visibility: PI sees all, Coordinator sees only assigned fund sources, Requester sees only their own
// - Basic charts (SVG) for expense breakdown by category and by funder
// - Pink theme and KMC banner (replaceable image area)
// NOTE: This is a prototype for demo/testing. For production replace localStorage with secure backend, implement proper password hashing and secure file storage, and enable email notifications.

const STORAGE = {
  USERS: "sll360_users_v2",
  REQS: "sll360_reqs_v2",
};

const ROLES = ["Admin", "PI", "Coordinator", "Facilitator", "Field Staff", "Finance"];
const CATEGORIES = [
  "Fuel",
  "Per diem",
  "Mentors payment",
  "Transport",
  "Air ticket",
  "Training per diem",
  "Hotel/refreshment",
  "Other",
];

function uid() {
  return Math.random().toString(36).slice(2, 9);
}

function now() {
  return new Date().toISOString();
}

function load(key, fallback) {
  try {
    return JSON.parse(localStorage.getItem(key)) || fallback;
  } catch (e) {
    return fallback;
  }
}
function save(key, value) {
  localStorage.setItem(key, JSON.stringify(value));
}

// Seed initial admin and sample users/requests if not present
function seed() {
  const users = load(STORAGE.USERS, null);
  if (!users) {
    const initial = [
      { id: uid(), username: "admin", password: "admin123", role: "Admin", name: "Admin User" },
      { id: uid(), username: "pi", password: "pi123", role: "PI", name: "Principal Investigator" },
      { id: uid(), username: "fac", password: "fac123", role: "Facilitator", name: "Facilitator" },
      { id: uid(), username: "coord1", password: "coord123", role: "Coordinator", name: "Coord NICU", fundSources: ["FunderA"] },
      { id: uid(), username: "field1", password: "field123", role: "Field Staff", name: "Field Worker A" },
      { id: uid(), username: "finance", password: "finance123", role: "Finance", name: "Finance Officer" },
    ];
    save(STORAGE.USERS, initial);
  }
  const reqs = load(STORAGE.REQS, null);
  if (!reqs) {
    save(STORAGE.REQS, []);
  }
}

seed();

export default function App() {
  // Auth
  const [user, setUser] = useState(null);
  const [users, setUsers] = useState(load(STORAGE.USERS, []));
  const [requests, setRequests] = useState(load(STORAGE.REQS, []));

  // UI state
  const [screen, setScreen] = useState("dashboard");
  const [loginForm, setLoginForm] = useState({ username: "", password: "" });
  const [regForm, setRegForm] = useState({ username: "", password: "", role: "Field Staff", name: "", fundSources: "" });
  const [reqForm, setReqForm] = useState({ type: "Per diem", program: "General", purpose: "", amount: "", funder: "FunderA", category: "Per diem", startDate: "", endDate: "", notes: "" });
  const [selected, setSelected] = useState(null);
  const [filter, setFilter] = useState({ funder: "All", status: "All", program: "All" });

  useEffect(() => {
    save(STORAGE.USERS, users);
  }, [users]);
  useEffect(() => {
    save(STORAGE.REQS, requests);
  }, [requests]);

  // Auth functions
  function handleLogin(e) {
    e.preventDefault();
    const u = users.find(x => x.username === loginForm.username && x.password === loginForm.password);
    if (u) {
      setUser(u);
      setLoginForm({ username: "", password: "" });
    } else {
      alert("Invalid credentials. Use seeded users: admin/admin123 or pi/pi123 or fac/fac123 or coord1/coord123 or field1/field123 or finance/finance123");
    }
  }
  function logout() {
    setUser(null);
    setSelected(null);
  }

  // Admin: add user
  function addUser(e) {
    e.preventDefault();
    if (!regForm.username || !regForm.password) return alert("fill username & password");
    const exists = users.some(u => u.username === regForm.username);
    if (exists) return alert("username exists");
    const newU = { id: uid(), username: regForm.username, password: regForm.password, role: regForm.role, name: regForm.name || regForm.username };
    if (regForm.role === "Coordinator") {
      newU.fundSources = regForm.fundSources ? regForm.fundSources.split(",").map(s => s.trim()) : [];
    }
    setUsers([newU, ...users]);
    setRegForm({ username: "", password: "", role: "Field Staff", name: "", fundSources: "" });
  }

  // Request functions
  function submitRequest(e) {
    e.preventDefault();
    if (!user) return alert("login as Field Staff to submit");
    const r = {
      id: uid(),
      createdAt: now(),
      createdBy: user.id,
      createdByName: user.name,
      type: reqForm.type,
      program: reqForm.program,
      purpose: reqForm.purpose,
      amount: Number(reqForm.amount) || 0,
      funder: reqForm.funder,
      category: reqForm.category,
      startDate: reqForm.startDate,
      endDate: reqForm.endDate,
      notes: reqForm.notes,
      status: "Pending Facilitator",
      files: [], // supporting docs
      approvalLetter: null, // base64 file or editable template
      history: [{ who: user.name, role: user.role, action: "Submitted", at: now() }],
      reimbursed: 0,
    };
    setRequests([r, ...requests]);
    setReqForm({ type: "Per diem", program: "General", purpose: "", amount: "", funder: reqForm.funder, category: "Per diem", startDate: "", endDate: "", notes: "" });
    alert("Request submitted. It will go to the Facilitator next.");
  }

  // File upload helper
  function handleFileUpload(file, cb) {
    const reader = new FileReader();
    reader.onload = () => cb(reader.result);
    reader.readAsDataURL(file);
  }

  // Add supporting file to request
  function addFileToRequest(reqId, file) {
    handleFileUpload(file, dataUrl => {
      setRequests(requests.map(r => r.id === reqId ? { ...r, files: [{ name: file.name, dataUrl }, ...(r.files || [])] } : r));
    });
  }

  // Actions: facilitator forward to coordinator, coordinator approve -> PI, PI approve -> finance, finance mark paid
  function actForward(reqId, action, opts = {}) {
    setRequests(requests.map(r => {
      if (r.id !== reqId) return r;
      const copy = { ...r };
      const actor = user ? user.name + ' (' + user.role + ')' : 'System';
      if (action === 'fac_forward') {
        copy.status = 'Pending Coordinator';
        copy.history = [...copy.history, { who: user.name, role: user.role, action: 'Facilitator forwarded to Coordinator', at: now() }];
      } else if (action === 'coord_approve') {
        copy.status = 'Pending PI';
        copy.history = [...copy.history, { who: user.name, role: user.role, action: 'Coordinator Approved', at: now() }];
      } else if (action === 'pi_approve') {
        copy.status = 'Approved for Finance';
        copy.history = [...copy.history, { who: user.name, role: user.role, action: 'PI Approved', at: now() }];
        // create a default approval letter template
        copy.approvalLetter = copy.approvalLetter || `Approval Letter

Request ID: ${copy.id}
Approved by: ${user.name} (PI)
Amount: ${copy.amount} ETB
Purpose: ${copy.purpose}

(Sign here)`;
      } else if (action === 'finance_paid') {
        copy.status = 'Paid';
        copy.reimbursed = opts.reimbursed || copy.amount || 0;
        copy.history = [...copy.history, { who: user.name, role: user.role, action: `Finance marked paid: ${copy.reimbursed} ETB`, at: now() }];
      } else if (action === 'reject') {
        copy.status = 'Rejected';
        copy.history = [...copy.history, { who: user.name, role: user.role, action: opts.reason || 'Rejected', at: now() }];
      } else if (action === 'upload_letter') {
        // opts.letter is base64 or text
        copy.approvalLetter = opts.letter;
        copy.history = [...copy.history, { who: user.name, role: user.role, action: 'Approval letter uploaded/edited', at: now() }];
      }
      return copy;
    }));
  }

  // Utility: find user by id
  function findUser(id) {
    return users.find(u => u.id === id);
  }

  // Filters & visibility
  function visibleRequests() {
    if (!user) return [];
    if (user.role === 'PI') return requests;
    if (user.role === 'Admin') return requests;
    if (user.role === 'Finance') return requests;
    if (user.role === 'Facilitator') return requests; // facilitator sees all to triage
    if (user.role === 'Coordinator') {
      // show only those matching coordinator fundSources
      const fs = user.fundSources || [];
      return requests.filter(r => fs.includes(r.funder));
    }
    if (user.role === 'Field Staff') {
      return requests.filter(r => r.createdBy === user.id);
    }
    return [];
  }

  // Derived stats for charts (by visible requests or all if PI)
  function expenseByCategory(filtered = null) {
    const list = (filtered || visibleRequests());
    const summary = {};
    CATEGORIES.forEach(c => summary[c] = 0);
    list.forEach(r => { summary[r.category] = (summary[r.category] || 0) + (r.reimbursed || r.amount || 0); });
    return summary;
  }
  function expenseByFunder(filtered = null) {
    const list = (filtered || visibleRequests());
    const summary = {};
    list.forEach(r => { summary[r.funder] = (summary[r.funder] || 0) + (r.reimbursed || r.amount || 0); });
    return summary;
  }

  // Simple SVG chart component
  function BarChart({ data, title }) {
    const entries = Object.entries(data).filter(([, v]) => v > 0);
    const total = entries.reduce((s, [, v]) => s + v, 0) || 1;
    return (
      <div className="mt-3">
        <h4 className="font-semibold mb-2">{title}</h4>
        {entries.length === 0 && <div className="text-sm text-gray-500">No data</div>}
        {entries.map(([k, v], i) => {
          const pct = Math.round((v / total) * 100);
          return (
            <div key={k} className="mb-1">
              <div className="flex justify-between text-sm"><div>{k}</div><div>{v} ETB</div></div>
              <div className="w-full bg-pink-100 rounded h-3"><div style={{ width: `${pct}%` }} className="h-3 bg-pink-500 rounded"></div></div>
            </div>
          );
        })}
      </div>
    );
  }

  // Print approval letter
  function printLetter(text) {
    const w = window.open('', '_blank');
    w.document.write('<pre style="font-family: Arial; font-size:14px">' + (text || '') + '</pre>');
    w.document.close();
    w.focus();
    w.print();
  }

  // Helpers for displaying status and action availability
  function canFacForward(r) {
    return user && user.role === 'Facilitator' && r.status === 'Pending Facilitator';
  }
  function canCoordAct(r) {
    return user && user.role === 'Coordinator' && r.status === 'Pending Coordinator' && (user.fundSources || []).includes(r.funder);
  }
  function canPIAct(r) {
    return user && user.role === 'PI' && r.status === 'Pending PI';
  }
  function canFinanceAct(r) {
    return user && user.role === 'Finance' && r.status === 'Approved for Finance';
  }

  // UI pieces
  if (!user) {
    return (
      <div className="min-h-screen bg-pink-50 p-4">
        <div className="max-w-2xl mx-auto bg-white rounded shadow p-4">
          <div className="flex items-center gap-4">
            <div style={{ width: 80, height: 80 }} className="bg-pink-200 rounded flex items-center justify-center">KMC</div>
            <div>
              <h1 className="text-2xl font-bold text-pink-700">SLL360 SRAT</h1>
              <div className="text-sm text-gray-600">Smart Request & Approval Tracker</div>
            </div>
          </div>

          <form className="mt-4" onSubmit={handleLogin}>
            <div>
              <label className="block text-sm">Username</label>
              <input className="w-full border rounded p-2" value={loginForm.username} onChange={e => setLoginForm({ ...loginForm, username: e.target.value })} />
            </div>
            <div className="mt-2">
              <label className="block text-sm">Password</label>
              <input type="password" className="w-full border rounded p-2" value={loginForm.password} onChange={e => setLoginForm({ ...loginForm, password: e.target.value })} />
            </div>
            <div className="mt-3 flex gap-2">
              <button className="px-4 py-2 bg-pink-600 text-white rounded">Login</button>
              <button type="button" className="px-4 py-2 border rounded" onClick={() => alert('Seeded users: admin/admin123, pi/pi123, fac/fac123, coord1/coord123, field1/field123, finance/finance123')}>Show demo users</button>
            </div>
          </form>

          <div className="mt-4 border-t pt-3 text-sm text-gray-600">If you are testing: use one of the seeded users or ask Admin to create new users.</div>
        </div>
      </div>
    );
  }

  // Main app for logged in users
  return (
    <div className="min-h-screen bg-pink-50 p-4">
      <div className="max-w-6xl mx-auto">
        <header className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-4">
            <div style={{ width: 72, height: 72 }} className="bg-pink-200 rounded flex items-center justify-center">KMC</div>
            <div>
              <h1 className="text-2xl font-bold text-pink-700">SLL360 SRAT</h1>
              <div className="text-sm text-gray-600">Signed in: <strong>{user.name}</strong> — <em>{user.role}</em></div>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <div className="text-sm text-gray-600">Theme: <span className="font-semibold text-pink-600">Pink</span></div>
            <button className="px-3 py-1 border rounded" onClick={() => { logout(); }}>Logout</button>
          </div>
        </header>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          <aside className="col-span-1 bg-white p-4 rounded shadow">
            <h2 className="font-semibold">Quick Actions</h2>
            <div className="mt-2 space-y-2">
              {user.role === 'Admin' && (
                <div>
                  <h3 className="font-medium">Add user</h3>
                  <form onSubmit={addUser} className="space-y-2 mt-2">
                    <input placeholder="username" className="w-full border p-1 rounded" value={regForm.username} onChange={e => setRegForm({ ...regForm, username: e.target.value })} />
                    <input placeholder="password" type="password" className="w-full border p-1 rounded" value={regForm.password} onChange={e => setRegForm({ ...regForm, password: e.target.value })} />
                    <select className="w-full border p-1 rounded" value={regForm.role} onChange={e => setRegForm({ ...regForm, role: e.target.value })}>
                      {ROLES.map(r => <option key={r}>{r}</option>)}
                    </select>
                    {regForm.role === 'Coordinator' && (<input placeholder="Fund sources (comma-separated)" className="w-full border p-1 rounded" value={regForm.fundSources} onChange={e => setRegForm({ ...regForm, fundSources: e.target.value })} />)}
                    <input placeholder="Full name" className="w-full border p-1 rounded" value={regForm.name} onChange={e => setRegForm({ ...regForm, name: e.target.value })} />
                    <div className="flex gap-2"><button className="px-3 py-1 bg-pink-600 text-white rounded">Create</button></div>
                  </form>
                </div>
              )}

              {user.role === 'Field Staff' && (
                <div>
                  <h3 className="font-medium">Submit Request</h3>
                  <form onSubmit={submitRequest} className="space-y-2 mt-2">
                    <select value={reqForm.funder} onChange={e => setReqForm({ ...reqForm, funder: e.target.value })} className="w-full border p-1 rounded">
                      <option>FunderA</option>
                      <option>FunderB</option>
                      <option>FunderC</option>
                    </select>
                    <select value={reqForm.category} onChange={e => setReqForm({ ...reqForm, category: e.target.value })} className="w-full border p-1 rounded">
                      {CATEGORIES.map(c => <option key={c}>{c}</option>)}
                    </select>
                    <input placeholder="Purpose" className="w-full border p-1 rounded" value={reqForm.purpose} onChange={e => setReqForm({ ...reqForm, purpose: e.target.value })} required />
                    <input placeholder="Amount" type="number" className="w-full border p-1 rounded" value={reqForm.amount} onChange={e => setReqForm({ ...reqForm, amount: e.target.value })} />
                    <input placeholder="Program" className="w-full border p-1 rounded" value={reqForm.program} onChange={e => setReqForm({ ...reqForm, program: e.target.value })} />
                    <input placeholder="Start date" type="date" className="w-full border p-1 rounded" value={reqForm.startDate} onChange={e => setReqForm({ ...reqForm, startDate: e.target.value })} />
                    <input placeholder="End date" type="date" className="w-full border p-1 rounded" value={reqForm.endDate} onChange={e => setReqForm({ ...reqForm, endDate: e.target.value })} />
                    <textarea placeholder="Notes" className="w-full border p-1 rounded" value={reqForm.notes} onChange={e => setReqForm({ ...reqForm, notes: e.target.value })} />
                    <div className="flex gap-2"><button className="px-3 py-1 bg-pink-600 text-white rounded">Submit</button></div>
                  </form>
                </div>
              )}

              <div>
                <h3 className="font-medium">Users (sample)</h3>
                <ul className="text-sm ml-3">
                  {users.slice(0,6).map(u => <li key={u.id}>{u.name} — <em>{u.role}</em>{u.fundSources ? ` — ${u.fundSources.join(',')}` : ''}</li>)}
                </ul>
              </div>
            </div>

            <div className="mt-4 text-xs text-gray-600">Note: This is a demo prototype. Files and data are stored in your browser (localStorage). For wider team use, we will connect to a cloud backend.</div>
          </aside>

          <main className="col-span-2 bg-white p-4 rounded shadow">
            <div className="flex justify-between items-center mb-2">
              <h2 className="font-semibold">Requests</h2>
              <div className="flex gap-2">
                <select className="border p-1 rounded" value={filter.funder} onChange={e => setFilter({ ...filter, funder: e.target.value })}>
                  <option>All</option>
                  <option>FunderA</option>
                  <option>FunderB</option>
                  <option>FunderC</option>
                </select>
                <select className="border p-1 rounded" value={filter.status} onChange={e => setFilter({ ...filter, status: e.target.value })}>
                  <option>All</option>
                  <option>Pending Facilitator</option>
                  <option>Pending Coordinator</option>
                  <option>Pending PI</option>
                  <option>Approved for Finance</option>
                  <option>Paid</option>
                  <option>Rejected</option>
                </select>
                <input placeholder="Program filter" className="border p-1 rounded" value={filter.program} onChange={e => setFilter({ ...filter, program: e.target.value })} />
              </div>
            </div>

            <div className="space-y-2">
              {visibleRequests().filter(r => (filter.funder === 'All' || r.funder === filter.funder) && (filter.status === 'All' || r.status === filter.status) && (filter.program === 'All' || r.program.includes(filter.program))).length === 0 && <div className="text-sm text-gray-500">No requests</div>}

              {visibleRequests().filter(r => (filter.funder === 'All' || r.funder === filter.funder) && (filter.status === 'All' || r.status === filter.status) && (filter.program === 'All' || r.program.includes(filter.program))).map(r => (
                <div key={r.id} className="border rounded p-3 flex justify-between items-start">
                  <div>
                    <div className="text-sm text-gray-600">{new Date(r.createdAt).toLocaleString()} — <span className="text-xs">{r.funder}</span></div>
                    <div className="font-medium">{r.category} • {r.purpose}</div>
                    <div className="text-sm">Program: {r.program} • Amount: {r.amount} ETB • Status: <strong>{r.status}</strong></div>
                    <div className="text-sm text-gray-600">Requested by: {r.createdByName}</div>
                  </div>
                  <div className="flex flex-col gap-2">
                    <button className="px-2 py-1 border rounded text-sm" onClick={() => setSelected(r)}>Details</button>

                    {canFacForward(r) && <button className="px-2 py-1 bg-pink-600 text-white rounded text-sm" onClick={() => actForward(r.id, 'fac_forward')}>Forward to Coordinator</button>}
                    {canCoordAct(r) && (
                      <div className="flex gap-1">
                        <button className="px-2 py-1 bg-pink-600 text-white rounded text-sm" onClick={() => actForward(r.id, 'coord_approve')}>Approve to PI</button>
                        <button className="px-2 py-1 border rounded text-sm" onClick={() => { const reason = prompt('Reason to reject') || 'Rejected by Coordinator'; actForward(r.id, 'reject', { reason }); }}>Reject</button>
                      </div>
                    )}
                    {canPIAct(r) && (
                      <div className="flex gap-1">
                        <button className="px-2 py-1 bg-pink-600 text-white rounded text-sm" onClick={() => actForward(r.id, 'pi_approve')}>Approve to Finance</button>
                        <button className="px-2 py-1 border rounded text-sm" onClick={() => { const reason = prompt('Reason to reject') || 'Rejected by PI'; actForward(r.id, 'reject', { reason }); }}>Reject</button>
                      </div>
                    )}
                    {canFinanceAct(r) && (
                      <div className="flex gap-1">
                        <button className="px-2 py-1 bg-pink-600 text-white rounded text-sm" onClick={() => { const amt = Number(prompt('Paid amount', r.amount) || r.amount); actForward(r.id, 'finance_paid', { reimbursed: amt }); }}>Mark Paid</button>
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>

            {selected && (
              <div className="mt-4 border-t pt-4">
                <h3 className="font-semibold">Request details</h3>
                <div className="text-sm">ID: {selected.id}</div>
                <div className="text-sm">Created by: {selected.createdByName} • {new Date(selected.createdAt).toLocaleString()}</div>
                <div className="mt-2">
                  <div><strong>Funder:</strong> {selected.funder}</div>
                  <div><strong>Category:</strong> {selected.category}</div>
                  <div><strong>Purpose:</strong> {selected.purpose}</div>
                  <div><strong>Amount:</strong> {selected.amount} ETB</div>
                  <div><strong>Program:</strong> {selected.program}</div>
                  <div><strong>Dates:</strong> {selected.startDate} — {selected.endDate}</div>
                  <div className="mt-2"><strong>Files</strong>
                    <ul className="ml-6 list-disc text-sm">
                      {(selected.files || []).map((f, idx) => (
                        <li key={idx}><a href={f.dataUrl} target="_blank" rel="noreferrer" className="text-pink-600">{f.name}</a></li>
                      ))}
                    </ul>
                    <div className="mt-2">
                      <input type="file" onChange={e => { if (e.target.files && e.target.files[0]) addFileToRequest(selected.id, e.target.files[0]); }} />
                    </div>
                  </div>

                  <div className="mt-2"><strong>Approval Letter</strong>
                    <div className="mt-2">
                      {selected.approvalLetter ? (
                        <div>
                          <pre style={{ whiteSpace: 'pre-wrap', background: '#fff6f8', padding: 8, borderRadius: 6 }}>{selected.approvalLetter}</pre>
                          {(user.role === 'PI' || user.role === 'Admin') && (
                            <div className="mt-2 flex gap-2">
                              <button className="px-2 py-1 border rounded" onClick={() => {
                                const text = prompt('Edit approval letter', selected.approvalLetter) || selected.approvalLetter;
                                actForward(selected.id, 'upload_letter', { letter: text });
                                setSelected(requests.find(r => r.id === selected.id));
                              }}>Edit Letter</button>
                              <button className="px-2 py-1 bg-pink-600 text-white rounded" onClick={() => printLetter(selected.approvalLetter)}>Print Letter</button>
                            </div>
                          )}
                        </div>
                      ) : (
                        <div className="text-sm text-gray-500">No approval letter yet.</div>
                      )}
                    </div>
                  </div>

                  <div className="mt-3"><strong>History</strong>
                    <ul className="ml-6 list-disc text-sm">
                      {selected.history.map((h, i) => <li key={i}>{h.at} — {h.role} ({h.who}): {h.action}</li>)}
                    </ul>
                  </div>

                  <div className="mt-3"><strong>Reimbursed:</strong> {selected.reimbursed || 0} ETB</div>

                  <div className="mt-3"><button className="px-3 py-1 border rounded" onClick={() => setSelected(null)}>Close</button></div>
                </div>
              </div>
            )}

            {/* Charts area (visible for PI and Coordinator limited) */}
            <div className="mt-6 border-t pt-4 grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="bg-white p-3 rounded">
                <h3 className="font-semibold">Expenses by Category</h3>
                <BarChart data={expenseByCategory()} title="Expenses by Category (ETB)" />
              </div>
              <div className="bg-white p-3 rounded">
                <h3 className="font-semibold">Expenses by Funder</h3>
                <BarChart data={expenseByFunder()} title="Expenses by Funder (ETB)" />
              </div>
            </div>

          </main>
        </div>

        <footer className="text-center text-xs text-gray-500 mt-6">Prototype — localStorage demo. For production: add backend (Supabase/Firebase), secure passwords, email alerts, and PDF storage.</footer>
      </div>
    </div>
  );
}
