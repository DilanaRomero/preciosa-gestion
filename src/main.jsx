import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import './styles.css'

class AppErrorBoundary extends React.Component {
  constructor(props) {
    super(props)
    this.state = { error: null }
  }
  static getDerivedStateFromError(error) {
    return { error }
  }
  render() {
    if (this.state.error) {
      return (
        <div style={{minHeight:'100vh',display:'grid',placeItems:'center',padding:24,fontFamily:'system-ui',background:'#fbf9fc',color:'#251d2b'}}>
          <div style={{maxWidth:680,background:'#fff',border:'1px solid #eee7f1',borderRadius:18,padding:24,boxShadow:'0 12px 40px rgba(47,28,57,.08)'}}>
            <h1 style={{marginTop:0}}>Preciosa Gestión encontró un error</h1>
            <p style={{color:'#756b79'}}>Copia este mensaje y envíamelo para corregirlo:</p>
            <pre style={{whiteSpace:'pre-wrap',background:'#faf7fb',padding:14,borderRadius:12,overflow:'auto'}}>{this.state.error?.stack || String(this.state.error)}</pre>
            <button onClick={()=>location.reload()} style={{border:0,borderRadius:10,padding:'10px 14px',background:'#6f4d91',color:'#fff',fontWeight:700}}>Recargar</button>
          </div>
        </div>
      )
    }
    return this.props.children
  }
}

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <AppErrorBoundary><App /></AppErrorBoundary>
  </React.StrictMode>
)
