import React, { useEffect, useState } from 'react'
import { supabase } from './lib/supabase'

const menu = [
  ['dashboard','Resumen','◉'],['inventory','Inventario','◇'],['customers','Clientes','◌'],
  ['live','Live','●'],['payments','Pagos','$'],['shipments','Entregas','↗'],['workers','Trabajadores','◫']
]
const money = (n=0) => `Bs ${Number(n).toFixed(2)}`

export default function App(){
  const [session,setSession]=useState(null),[view,setView]=useState('dashboard'),[loading,setLoading]=useState(true)
  useEffect(()=>{supabase.auth.getSession().then(({data})=>{setSession(data.session);setLoading(false)});const {data:s}=supabase.auth.onAuthStateChange((_,x)=>setSession(x));return()=>s.subscription.unsubscribe()},[])
  if(loading)return <div className="splash"><div className="logo-mark">P</div><p>Cargando Preciosa Gestión…</p></div>
  if(!session)return <Login/>
  return <div className="app-shell"><aside className="sidebar"><div className="brand"><div className="logo-mark">P</div><div><strong>Preciosa</strong><span>Gestión</span></div></div><div className="live-badge"><span className="dot"/> Sistema conectado</div><nav>{menu.map(([id,label,icon])=><button key={id} className={view===id?'nav-item active':'nav-item'} onClick={()=>setView(id)}><span className="nav-icon">{icon}</span>{label}</button>)}</nav><button className="user-mini" onClick={()=>supabase.auth.signOut()}><div className="avatar">{(session.user.email?.[0]||'U').toUpperCase()}</div><div><b>{session.user.email?.split('@')[0]}</b><span>Cerrar sesión</span></div></button></aside><main className="main-content"><header className="topbar"><div><div className="eyebrow">PRECIOSA GESTIÓN</div><h1>{menu.find(x=>x[0]===view)?.[1]}</h1></div><span className="today">Hoy · {new Date().toLocaleDateString('es-BO')}</span></header><section className="page-wrap">{view==='dashboard'&&<Dashboard/>}{view==='inventory'&&<Inventory/>}{view==='customers'&&<Customers/>}{view==='live'&&<Live/>}{view==='payments'&&<Payments/>}{view==='shipments'&&<Shipments/>}{view==='workers'&&<Workers/>}</section></main></div>
}

function Login(){const[email,setEmail]=useState(''),[message,setMessage]=useState(''),[busy,setBusy]=useState(false);const submit=async e=>{e.preventDefault();setBusy(true);const{error}=await supabase.auth.signInWithOtp({email,options:{emailRedirectTo:location.origin}});setBusy(false);setMessage(error?error.message:'Revisa tu correo: te enviamos el enlace de acceso.')};return <div className="login-page"><div className="login-card"><div className="logo-mark big">P</div><div className="eyebrow">PRECIOSA GESTIÓN</div><h1>Controla tu negocio desde un solo lugar.</h1><p className="muted">Inventario, ventas de TikTok, clientes, pagos, entregas y horas de trabajo.</p><form onSubmit={submit}><label>Correo de acceso<input type="email" required value={email} onChange={e=>setEmail(e.target.value)} placeholder="tu@correo.com"/></label><button className="primary wide" disabled={busy}>{busy?'Enviando…':'Entrar con enlace seguro'}</button></form>{message&&<div className="notice">{message}</div>}</div></div>}

function Panel({title,subtitle,children}){return <div className="panel"><div className="panel-title"><div><b>{title}</b>{subtitle&&<span>{subtitle}</span>}</div></div>{children}</div>}
function Dashboard(){const[stats,setStats]=useState({customers:0,units:0,reserved:0,revenue:0});useEffect(()=>{(async()=>{const[a,b,c,d]=await Promise.all([supabase.from('customers').select('*',{count:'exact',head:true}),supabase.from('product_units').select('*',{count:'exact',head:true}),supabase.from('product_units').select('*',{count:'exact',head:true}).eq('status','reserved'),supabase.from('order_balances').select('paid_amount')]);setStats({customers:a.count||0,units:b.count||0,reserved:c.count||0,revenue:(d.data||[]).reduce((x,r)=>x+Number(r.paid_amount||0),0)})})()},[]);return <><div className="hero"><div><span className="eyebrow">CONTROL CENTRAL</span><h2>Tu negocio, claro y ordenado.</h2><p>Inventario, lives, clientes, pagos y entregas en un solo lugar.</p></div><div className="hero-orb">✦</div></div><div className="stats-grid"><Stat label="Clientes" value={stats.customers} caption="perfiles registrados"/><Stat label="Unidades" value={stats.units} caption="productos terminados"/><Stat label="Reservadas" value={stats.reserved} caption="pendientes de entrega"/><Stat label="Ventas con pago" value={money(stats.revenue)} caption="según pedidos"/></div><Panel title="Flujo del negocio" subtitle="La operación queda registrada paso a paso"><div className="steps">{[['01','Armar','Joya + empaque → costo y precio'],['02','Live','“mío” → reserva individual'],['03','Cobrar','Abonos parciales → deuda real'],['04','Entregar','Agrupa compras → salida física']].map(x=><div className="step" key={x[0]}><span>{x[0]}</span><div><b>{x[1]}</b><small>{x[2]}</small></div></div>)}</div></Panel></>}
function Stat({label,value,caption}){return <div className="stat-card"><span>{label}</span><strong>{value}</strong><small>{caption}</small></div>}

function Inventory(){
  const [tab,setTab]=useState('units');
  const [ingredients,setIngredients]=useState([]);
  const [units,setUnits]=useState([]);
  const [productCount,setProductCount]=useState(0);
  const [newIngredient,setNewIngredient]=useState({name:'',cost:'',stock:''});
  const [description,setDescription]=useState('');
  const [components,setComponents]=useState([{ingredient_id:'',quantity:1},{ingredient_id:'',quantity:1},{ingredient_id:'',quantity:1}]);
  const [msg,setMsg]=useState('');
  const [busy,setBusy]=useState(false);

  const load=async()=>{
    const [{data:i},{data:u},{count:pCount}]=await Promise.all([
      supabase.from('ingredients').select('id,code,name,unit_cost,stock_qty,active').eq('active',true).order('name'),
      supabase.from('product_units').select('id,code,description,status,created_at,product:products(name,cost,sale_price)').order('created_at',{ascending:false}),
      supabase.from('products').select('id',{count:'exact',head:true})
    ]);
    setIngredients(i||[]); setUnits(u||[]); setProductCount(pCount||0);
  };
  useEffect(()=>{load()},[]);

  const addIngredient=async e=>{
    e.preventDefault(); setBusy(true); setMsg('');
    const {error}=await supabase.rpc('create_ingredient',{p_name:newIngredient.name,p_unit_cost:Number(newIngredient.cost),p_stock_qty:Number(newIngredient.stock)});
    setBusy(false); setMsg(error?error.message:'Producto suelto guardado. Su código se generó automáticamente.');
    if(!error){setNewIngredient({name:'',cost:'',stock:''});load()}
  };

  const pick=(index,value)=>setComponents(prev=>prev.map((c,i)=>i===index?{...c,ingredient_id:value}:c));
  const setQty=(index,value)=>setComponents(prev=>prev.map((c,i)=>i===index?{...c,quantity:Number(value)||0}:c));
  const selectedComponents=components.filter(c=>c.ingredient_id);
  const computedCost=selectedComponents.reduce((sum,c)=>{const item=ingredients.find(i=>i.id===c.ingredient_id);return sum+(item?Number(item.unit_cost)*Number(c.quantity||0):0)},0);
  const computedSale=computedCost*1.5;

  const assemble=async e=>{
    e.preventDefault(); setBusy(true); setMsg('');
    if(selectedComponents.length<2){setBusy(false);setMsg('Selecciona al menos 2 productos que formen la unidad.');return}
    const ids=selectedComponents.map(c=>c.ingredient_id);
    if(new Set(ids).size!==ids.length){setBusy(false);setMsg('No repitas el mismo producto dentro de una unidad.');return}
    const {data,error}=await supabase.rpc('assemble_unit_from_components',{p_description:description.trim(),p_components:selectedComponents,p_multiplier:1.5});
    setBusy(false); setMsg(error?error.message:`Unidad ${data} armada correctamente. El código se generó solo.`);
    if(!error){setDescription('');setComponents([{ingredient_id:'',quantity:1},{ingredient_id:'',quantity:1},{ingredient_id:'',quantity:1}]);load()}
  };

  return <>
    <div className="toolbar">
      <div><p className="muted">Registra productos sueltos y arma unidades con 2 o 3 componentes.</p></div>
      <div className="tabs"><button className={tab==='units'?'tab active':'tab'} onClick={()=>setTab('units')}>Unidades terminadas</button><button className={tab==='components'?'tab active':'tab'} onClick={()=>setTab('components')}>Productos sueltos</button></div>
    </div>
    {msg&&<div className="notice">{msg}</div>}

    {tab==='components' ? <div className="two-col">
      <Panel title="Productos sueltos" subtitle="Collares, cajas y cualquier componente que entre al inventario">
        <div className="table-wrap"><table><thead><tr><th>Código</th><th>Producto</th><th>Costo</th><th>Existencia</th></tr></thead>
        <tbody>{ingredients.map(i=><tr key={i.id}><td><b>{i.code}</b></td><td>{i.name}</td><td>{money(i.unit_cost)}</td><td>{i.stock_qty}</td></tr>)}{!ingredients.length&&<tr><td colSpan="4" className="empty">No hay productos sueltos todavía.</td></tr>}</tbody></table></div>
      </Panel>
      <Panel title="Agregar producto suelto" subtitle="El código se genera automáticamente">
        <form className="stack-form" onSubmit={addIngredient}>
          <label>Nombre<input required value={newIngredient.name} onChange={e=>setNewIngredient({...newIngredient,name:e.target.value})} placeholder="Caja corazón"/></label>
          <label>Costo unitario<input type="number" min="0" step="0.01" required value={newIngredient.cost} onChange={e=>setNewIngredient({...newIngredient,cost:e.target.value})} placeholder="10"/></label>
          <label>Existencia inicial<input type="number" min="0" step="1" required value={newIngredient.stock} onChange={e=>setNewIngredient({...newIngredient,stock:e.target.value})} placeholder="10"/></label>
          <button className="primary" disabled={busy}>{busy?'Guardando…':'Guardar producto suelto'}</button>
        </form>
      </Panel>
    </div> :
    <div className="two-col">
      <Panel title="Unidades terminadas" subtitle={`${units.length} unidades físicas · ${productCount} combinaciones`}>
        <div className="table-wrap"><table><thead><tr><th>Código</th><th>Descripción</th><th>Composición</th><th>Costo</th><th>Venta</th><th>Estado</th></tr></thead>
        <tbody>{units.map(u=><tr key={u.id}><td><b>{u.code}</b></td><td>{u.description}</td><td>{u.product?.name}</td><td>{money(u.product?.cost)}</td><td>{money(u.product?.sale_price)}</td><td><span className={'pill '+u.status}>{u.status}</span></td></tr>)}{!units.length&&<tr><td colSpan="6" className="empty">Todavía no armaste ninguna unidad.</td></tr>}</tbody></table></div>
      </Panel>
      <Panel title="Armar una unidad" subtitle="Selecciona 2 o 3 productos sueltos. El código NO lo escribes.">
        <form className="stack-form" onSubmit={assemble}>
          <label>Descripción de la unidad<textarea required value={description} onChange={e=>setDescription(e.target.value)} placeholder="Collar de tulipán con caja corazón" rows="3"/></label>
          {[0,1,2].map((idx)=> <div className="component-row" key={idx}>
            <div className="component-index">{idx+1}</div>
            <label>Producto {idx+1}<select required={idx<2} value={components[idx].ingredient_id} onChange={e=>pick(idx,e.target.value)}><option value="">{idx===2?'(opcional)':'Selecciona…'}</option>{ingredients.map(i=><option key={i.id} value={i.id}>{i.name} · {money(i.unit_cost)} · stock {i.stock_qty}</option>)}</select></label>
            <label>Cant.<input type="number" min="1" step="1" value={components[idx].quantity} onChange={e=>setQty(idx,e.target.value)}/></label>
          </div>)}
          <div className="price-preview"><div><span>Costo de la unidad</span><b>{money(computedCost)}</b></div><div><span>Precio sugerido ×1,5</span><b>{money(computedSale)}</b></div></div>
          <div className="selected-hint">El sistema descuenta los componentes del inventario y genera un código como <b>JOY-000001</b>.</div>
          <button className="primary" disabled={busy}>{busy?'Armando…':'Armar unidad y generar código'}</button>
        </form>
      </Panel>
    </div>}
  </>
}

function Live(){const[customers,setCustomers]=useState([]),[units,setUnits]=useState([]),[cid,setCid]=useState(''),[code,setCode]=useState(''),[price,setPrice]=useState(''),[msg,setMsg]=useState('');const load=async()=>{const[c,u]=await Promise.all([supabase.from('customers').select('id,tiktok_username,full_name').order('tiktok_username'),supabase.from('product_units').select('id,code,status,product:products(name,sale_price)').eq('status','available').order('code')]);setCustomers(c.data||[]);setUnits(u.data||[])};useEffect(()=>{load()},[]);useEffect(()=>{const u=units.find(x=>x.code===code.toUpperCase());if(u)setPrice(u.product?.sale_price||'')},[code,units]);const reserve=async e=>{e.preventDefault();const{data,error}=await supabase.rpc('reserve_product_unit',{p_unit_code:code.toUpperCase(),p_customer_id:cid,p_price:Number(price)});setMsg(error?.message||`Reserva registrada: ${data}`);if(!error){setCode('');setPrice('');load()}};return <div className="two-col"><Panel title="“MÍO” EN EL LIVE" subtitle="Reserva una pieza individual">{msg&&<div className="notice">{msg}</div>}<form className="stack-form" onSubmit={reserve}><label>Cliente<select required value={cid} onChange={e=>setCid(e.target.value)}><option value="">Selecciona…</option>{customers.map(c=><option key={c.id} value={c.id}>@{c.tiktok_username}</option>)}</select></label><label>Código de joya<input required value={code} onChange={e=>setCode(e.target.value.toUpperCase())} placeholder="JOY-0001"/></label><label>Precio anunciado<input type="number" min="0" step=".01" required value={price} onChange={e=>setPrice(e.target.value)}/></label><button className="primary">REGISTRAR MÍO</button></form></Panel><Panel title="Disponibles" subtitle="Unidades listas para vender"><div className="cards-list">{units.map(u=><div className="list-card" key={u.id}><div><b>{u.code}</b><small>{u.product?.name}</small></div><strong>{money(u.product?.sale_price)}</strong></div>)}</div></Panel></div>}

function Payments(){const[rows,setRows]=useState([]),[customers,setCustomers]=useState([]),[cid,setCid]=useState(''),[amount,setAmount]=useState(''),[method,setMethod]=useState('transfer'),[msg,setMsg]=useState('');const load=async()=>{const[c,b]=await Promise.all([supabase.from('customers').select('id,tiktok_username,full_name').order('tiktok_username'),supabase.from('customer_balances').select('*').gt('balance',0).order('balance',{ascending:false})]);setCustomers(c.data||[]);setRows(b.data||[])};useEffect(()=>{load()},[]);const pay=async e=>{e.preventDefault();const{error}=await supabase.rpc('register_customer_payment',{p_customer_id:cid,p_amount:Number(amount),p_method:method});setMsg(error?.message||'Pago registrado.');if(!error){setAmount('');load()}};return <div className="two-col"><Panel title="Cuentas por cobrar" subtitle="Deuda pendiente por cliente"><div className="table-wrap"><table><thead><tr><th>Cliente</th><th>Comprado</th><th>Pagado</th><th>Deuda</th></tr></thead><tbody>{rows.map(r=><tr key={r.customer_id}><td>@{r.tiktok_username}</td><td>{money(r.purchased_amount)}</td><td>{money(r.paid_amount)}</td><td><b>{money(r.balance)}</b></td></tr>)}{!rows.length&&<tr><td colSpan="4" className="empty">No hay deudas pendientes.</td></tr>}</tbody></table></div></Panel><Panel title="Registrar pago" subtitle="Se aplica a las deudas más antiguas">{msg&&<div className="notice">{msg}</div>}<form className="stack-form" onSubmit={pay}><label>Cliente<select required value={cid} onChange={e=>setCid(e.target.value)}><option value="">Selecciona…</option>{customers.map(c=><option key={c.id} value={c.id}>@{c.tiktok_username}</option>)}</select></label><label>Monto<input type="number" min=".01" step=".01" required value={amount} onChange={e=>setAmount(e.target.value)}/></label><label>Método<select value={method} onChange={e=>setMethod(e.target.value)}><option value="transfer">Transferencia</option><option value="qr">QR</option><option value="cash">Efectivo</option><option value="other">Otro</option></select></label><button className="primary">Confirmar pago</button></form></Panel></div>}

function Shipments(){const[rows,setRows]=useState([]),[msg,setMsg]=useState('');const load=async()=>{const{data}=await supabase.from('order_balances').select('*').order('order_date',{ascending:false});setRows(data||[])};useEffect(()=>{load()},[]);const ship=async id=>{const{data,error}=await supabase.rpc('ship_order',{p_order_id:id});setMsg(error?.message||`${data} marcado como enviado.`);if(!error)load()};return <Panel title="Entregas" subtitle="La salida física ocurre al marcar el pedido como enviado">{msg&&<div className="notice">{msg}</div>}<div className="table-wrap"><table><thead><tr><th>Pedido</th><th>Cliente</th><th>Fecha</th><th>Saldo</th><th>Estado</th><th></th></tr></thead><tbody>{rows.map(r=><tr key={r.order_id}><td>{r.order_number}</td><td>@{r.tiktok_username}</td><td>{r.order_date}</td><td>{money(r.balance)}</td><td>{r.fulfillment_status}</td><td>{!['shipped','delivered'].includes(r.fulfillment_status)&&<button className="small-btn" onClick={()=>ship(r.order_id)}>Marcar enviado</button>}</td></tr>)}{!rows.length&&<tr><td colSpan="6" className="empty">No hay pedidos todavía.</td></tr>}</tbody></table></div></Panel>}

function Workers(){const[rows,setRows]=useState([]),[open,setOpen]=useState(null),[msg,setMsg]=useState('');const load=async()=>{const{data}=await supabase.from('attendance').select('*, worker:profiles(full_name,email)').order('clock_in',{ascending:false}).limit(50);setRows(data||[]);const{data:u}=await supabase.auth.getUser();setOpen((data||[]).find(r=>r.worker_id===u?.user?.id&&!r.clock_out)||null)};useEffect(()=>{load()},[]);const in_=async()=>{const{error}=await supabase.rpc('clock_in');setMsg(error?.message||'Entrada registrada.');if(!error)load()};const out=async()=>{const{data,error}=await supabase.rpc('clock_out');setMsg(error?.message||`Salida registrada: ${Number(data).toFixed(2)} horas.`);if(!error)load()};return <div className="two-col"><Panel title="Mi jornada" subtitle="Registra entrada y salida">{msg&&<div className="notice">{msg}</div>}{open?<button className="primary" onClick={out}>REGISTRAR SALIDA</button>:<button className="primary" onClick={in_}>REGISTRAR ENTRADA</button>}</Panel><Panel title="Historial" subtitle="Horas registradas"><div className="table-wrap"><table><thead><tr><th>Trabajador</th><th>Entrada</th><th>Salida</th><th>Horas</th></tr></thead><tbody>{rows.map(r=><tr key={r.id}><td>{r.worker?.full_name||r.worker?.email||'—'}</td><td>{new Date(r.clock_in).toLocaleString('es-BO')}</td><td>{r.clock_out?new Date(r.clock_out).toLocaleString('es-BO'):'En curso'}</td><td>{r.hours_worked?Number(r.hours_worked).toFixed(2):'—'}</td></tr>)}</tbody></table></div></Panel></div>}