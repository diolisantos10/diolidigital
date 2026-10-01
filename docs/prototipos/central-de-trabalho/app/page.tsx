"use client";

import { useMemo, useState } from "react";

type IconName =
  | "home" | "check" | "calendar" | "users" | "folder" | "box" | "approve"
  | "message" | "grid" | "map" | "search" | "bell" | "chevron" | "arrow"
  | "spark" | "clock" | "alert" | "eye" | "close" | "send" | "briefcase"
  | "brand" | "social" | "design" | "ads" | "strategy" | "analytics" | "quality";

function Icon({ name, size = 18 }: { name: IconName; size?: number }) {
  const paths: Record<IconName, React.ReactNode> = {
    home: <><path d="M3 10.2 12 3l9 7.2"/><path d="M5.5 9v11h13V9M9.5 20v-6h5v6"/></>,
    check: <><rect x="3" y="3" width="18" height="18" rx="5"/><path d="m7.5 12 3 3 6-6"/></>,
    calendar: <><rect x="3" y="5" width="18" height="16" rx="3"/><path d="M8 3v4m8-4v4M3 10h18"/></>,
    users: <><circle cx="9" cy="8" r="3"/><circle cx="17" cy="9" r="2.5"/><path d="M3.5 20c.5-4 2.3-6 5.5-6s5 2 5.5 6M15 15c3.1.2 4.7 1.9 5 5"/></>,
    folder: <path d="M3 6.5a2 2 0 0 1 2-2h5l2 2h7a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>,
    box: <><path d="m4 7 8-4 8 4v10l-8 4-8-4z"/><path d="m4 7 8 4 8-4M12 11v10"/></>,
    approve: <><path d="M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20Z"/><path d="m7.5 12 3 3 6-6"/></>,
    message: <path d="M4 4h16v12H8l-4 4z"/>,
    grid: <><rect x="3" y="3" width="7" height="7" rx="2"/><rect x="14" y="3" width="7" height="7" rx="2"/><rect x="3" y="14" width="7" height="7" rx="2"/><rect x="14" y="14" width="7" height="7" rx="2"/></>,
    map: <><path d="m3 6 6-3 6 3 6-3v15l-6 3-6-3-6 3z"/><path d="M9 3v15m6-12v15"/></>,
    search: <><circle cx="10.5" cy="10.5" r="6.5"/><path d="m16 16 5 5"/></>,
    bell: <><path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9"/><path d="M9.5 21h5"/></>,
    chevron: <path d="m9 18 6-6-6-6"/>, arrow: <path d="M5 12h14m-5-5 5 5-5 5"/>,
    spark: <><path d="m12 2 1.8 6.2L20 10l-6.2 1.8L12 18l-1.8-6.2L4 10l6.2-1.8z"/><path d="m19 16 .8 2.2L22 19l-2.2.8L19 22l-.8-2.2L16 19l2.2-.8z"/></>,
    clock: <><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3.5 2"/></>,
    alert: <><path d="M12 3 2.5 20h19z"/><path d="M12 9v4m0 3h.01"/></>,
    eye: <><path d="M2.5 12s3.5-6 9.5-6 9.5 6 9.5 6-3.5 6-9.5 6-9.5-6-9.5-6Z"/><circle cx="12" cy="12" r="2.5"/></>,
    close: <path d="m6 6 12 12M18 6 6 18"/>, send: <><path d="m22 2-7 20-4-9-9-4z"/><path d="M22 2 11 13"/></>,
    briefcase: <><rect x="3" y="7" width="18" height="13" rx="3"/><path d="M9 7V4h6v3m-12 5h18"/></>,
    brand: <><circle cx="12" cy="12" r="8"/><circle cx="12" cy="12" r="3"/><path d="M12 2v2m0 16v2m10-10h-2M4 12H2"/></>,
    social: <><circle cx="7" cy="12" r="3"/><circle cx="17" cy="6" r="2"/><circle cx="17" cy="18" r="2"/><path d="m9.6 10.5 5.5-3.2m-5.5 6.2 5.5 3.2"/></>,
    design: <><path d="m4 20 4.5-1 10-10a2.8 2.8 0 0 0-4-4l-10 10z"/><path d="m13 6 5 5M4 20l1-5 4 4z"/></>,
    ads: <><path d="m3 11 15-6v14L3 13z"/><path d="M7 14v5h4"/></>,
    strategy: <><circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="4"/><path d="M12 3v3m9 6h-3m-6 9v-3M3 12h3"/></>,
    analytics: <path d="M4 20V10m5 10V4m6 16v-7m5 7V7"/>,
    quality: <><path d="m12 3 7 3v5c0 5-3 8-7 10-4-2-7-5-7-10V6z"/><path d="m8.5 12 2.2 2.2 4.8-5"/></>,
  };
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{paths[name]}</svg>;
}

const roles = {
  social: { label: "Social Media Agent", command: "Social Media Command Center", accent: "#16B8C8", workload: "18 conteúdos em produção" },
  branding: { label: "Branding Agent", command: "Brand Intelligence Center", accent: "#7967EE", workload: "4 marcas em evolução" },
  design: { label: "Design Agent", command: "Design Production Center", accent: "#FF7B55", workload: "11 peças em produção" },
  ads: { label: "Tráfego Pago Agent", command: "Paid Media Command Center", accent: "#0057FF", workload: "7 campanhas monitoradas" },
  pm: { label: "Project Manager", command: "Project Management Center", accent: "#12B5AC", workload: "12 clientes coordenados" },
  director: { label: "Diretor Geral", command: "Agency Operations Center", accent: "#070A1F", workload: "8 departamentos ativos" },
} as const;
type RoleKey = keyof typeof roles;

const clients = [
  { id: "foocci", name: "Foocci", segment: "Tecnologia para restaurantes", initials: "F", color: "#71E4E2", ink: "#070A1F", health: 86, headline: "Lançamento ganhando tração", next: "Calendário de lançamento · hoje, 16h", status: "Em crescimento", departments: [["Branding", "Marca consolidada", 92], ["Social Media", "18 conteúdos", 78], ["Design", "6 peças em revisão", 72], ["Tráfego Pago", "Campanha eficiente", 88], ["Estratégia", "Plano aprovado", 100], ["Analytics", "Dados conectados", 84]] },
  { id: "sushi", name: "Sushi Cazza", segment: "Restaurante japonês", initials: "S", color: "#111111", ink: "#FFFFFF", health: 74, headline: "Operação estável, atenção ao alcance", next: "Nova campanha local · amanhã", status: "Atenção", departments: [["Branding", "Consistente", 84], ["Social Media", "Alcance abaixo da meta", 62], ["Design", "Em dia", 90], ["Tráfego Pago", "Aguardando criativos", 58], ["Estratégia", "Plano ativo", 88], ["Analytics", "Dados conectados", 80]] },
  { id: "santio", name: "Santió", segment: "Eyewear premium", initials: "S", color: "#E6D7C7", ink: "#312B27", health: 91, headline: "Marca pronta para escalar", next: "Aprovação da coleção · sexta-feira", status: "Excelente", departments: [["Branding", "Brand Space completo", 96], ["Social Media", "Calendário aprovado", 92], ["Design", "Coleção em produção", 86], ["Tráfego Pago", "Públicos validados", 89], ["Estratégia", "Posicionamento forte", 98], ["Analytics", "Dados conectados", 87]] },
  { id: "cityjobs", name: "City Jobs", segment: "Plataforma de empregos", initials: "CJ", color: "#1A66FF", ink: "#FFFFFF", health: 68, headline: "Estruturação antes da aquisição", next: "Fechar proposta de valor · 22 ago", status: "Em estruturação", departments: [["Branding", "Identidade aprovada", 80], ["Social Media", "Aguardando estratégia", 42], ["Design", "Kit inicial pronto", 76], ["Tráfego Pago", "Não iniciado", 15], ["Estratégia", "Em construção", 64], ["Analytics", "Integrações pendentes", 32]] },
] as const;

const nav = [
  { label: "Início", icon: "home", active: true }, { label: "Meu trabalho", icon: "check", badge: 6 },
  { label: "Planner", icon: "calendar" }, { label: "Clientes", icon: "users", badge: 12 },
  { label: "Projetos", icon: "folder" }, { label: "Entregas", icon: "box" },
  { label: "Aprovações", icon: "approve", badge: 3 }, { label: "Comunicação", icon: "message", badge: 5 },
] as const;

const departments = [
  { name: "Estratégia", icon: "strategy", status: "Direção e posicionamento" }, { name: "Branding", icon: "brand", status: "Marca e consistência" },
  { name: "Social Media", icon: "social", status: "Conteúdo e comunidade" }, { name: "Design", icon: "design", status: "Sistema visual e produção" },
  { name: "Tráfego Pago", icon: "ads", status: "Aquisição e performance" }, { name: "Analytics", icon: "analytics", status: "Dados e inteligência" },
  { name: "Qualidade", icon: "quality", status: "Auditoria e padrões" },
] as const;

export default function Home() {
  const [role, setRole] = useState<RoleKey>("social");
  const [selectedClient, setSelectedClient] = useState<(typeof clients)[number] | null>(null);
  const [chatOpen, setChatOpen] = useState(false);
  const [mapExpanded, setMapExpanded] = useState(false);
  const current = roles[role];
  const roleTask = useMemo(() => {
    if (role === "social") return "Finalizar calendário editorial da Foocci";
    if (role === "branding") return "Revisar auditoria de marca da City Jobs";
    if (role === "design") return "Entregar coleção visual da Santió";
    if (role === "ads") return "Validar campanha de aquisição da Foocci";
    if (role === "pm") return "Resolver dependência entre Design e Tráfego";
    return "Revisar saúde geral da operação";
  }, [role]);

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand-lockup"><img src="/brand/dioli-logo-h-white.svg" alt="Dioli Digital" /><span>AGENCY OS</span></div>
        <nav className="primary-nav" aria-label="Navegação principal">
          <p className="nav-title">CENTRAL DE TRABALHO</p>
          {nav.map((item) => <button className={`nav-item ${item.active ? "active" : ""}`} key={item.label}><Icon name={item.icon} size={17}/><span>{item.label}</span>{"badge" in item && item.badge ? <b>{item.badge}</b> : null}</button>)}
          <p className="nav-title second">ESTRUTURA</p>
          <button className="nav-item" onClick={() => setMapExpanded(true)}><Icon name="map" size={17}/><span>Mapa da agência</span></button>
          <button className="nav-item"><Icon name="grid" size={17}/><span>Meu departamento</span></button>
        </nav>
        <div className="command-mini" style={{ "--role-accent": current.accent } as React.CSSProperties}>
          <span className="command-kicker">SEU ESPAÇO</span><strong>{current.command}</strong><small>{current.workload}</small><button>Entrar <Icon name="arrow" size={14}/></button>
        </div>
        <div className="sidebar-user"><div className="avatar">DO</div><div><strong>Diego Oliveira</strong><span>{current.label}</span></div><button aria-label="Abrir perfil"><Icon name="chevron" size={15}/></button></div>
      </aside>

      <section className="workspace">
        <header className="topbar">
          <button className="mobile-brand"><img src="/brand/dioli-mark-navy.svg" alt="Dioli" /></button>
          <div className="search-box"><Icon name="search" size={17}/><input aria-label="Buscar" placeholder="Buscar cliente, projeto, tarefa..."/><kbd>⌘ K</kbd></div>
          <div className="top-actions"><button className="client-filter"><span className="filter-dot"/>Todos os clientes <span className="count">12</span><span className="down">⌄</span></button><button className="pm-chat" onClick={() => setChatOpen(true)}><Icon name="message" size={16}/> Falar com o PM</button><button className="icon-button" aria-label="Notificações"><Icon name="bell" size={18}/><i/></button></div>
        </header>

        <main className="main-content">
          <div className="breadcrumb"><span>Central de Trabalho</span><b>/</b><strong>Início</strong></div>
          <section className="page-heading">
            <div><div className="eyebrow"><span/> OPERAÇÃO CONECTADA</div><h1>Bom dia, Diego.</h1><p>Seu trabalho, os clientes e os departamentos em uma única leitura.</p></div>
            <div className="role-control"><label htmlFor="role-select">Visualizar experiência como</label><select id="role-select" value={role} onChange={(event) => setRole(event.target.value as RoleKey)}>{Object.entries(roles).map(([key,item]) => <option value={key} key={key}>{item.label}</option>)}</select></div>
          </section>

          <section className="hero-panel">
            <div className="orbit orbit-one"/><div className="orbit orbit-two"/><div className="orbit-dot cyan"/><div className="orbit-dot blue"/>
            <div className="hero-copy"><span className="hero-tag"><Icon name="spark" size={14}/> LEITURA DO DIA</span><h2>Você tem <em>3 prioridades</em><br/>antes das 16h.</h2><p>Uma entrega depende de você e duas conversas precisam de encaminhamento.</p><button className="primary-action">Ver minhas prioridades <Icon name="arrow" size={16}/></button></div>
            <div className="hero-focus"><div className="focus-label"><span>PRÓXIMA AÇÃO</span><b>01</b></div><strong>{roleTask}</strong><p><Icon name="clock" size={14}/> Hoje, 14h30 · prioridade alta</p><div className="focus-progress"><i style={{width:"64%"}}/></div></div>
          </section>

          <section className="metrics-grid">
            <article><div className="metric-icon cyan-bg"><Icon name="check" size={18}/></div><div><span>MINHAS TAREFAS</span><strong>06</strong><small>2 para hoje</small></div></article>
            <article><div className="metric-icon blue-bg"><Icon name="box" size={18}/></div><div><span>ENTREGAS DA SEMANA</span><strong>08</strong><small className="positive">+3 concluídas</small></div></article>
            <article><div className="metric-icon orange-bg"><Icon name="approve" size={18}/></div><div><span>AGUARDANDO REVISÃO</span><strong>03</strong><small>1 vence hoje</small></div></article>
            <article><div className="metric-icon violet-bg"><Icon name="users" size={18}/></div><div><span>CLIENTES VISÍVEIS</span><strong>12</strong><small className="positive">acesso completo</small></div></article>
          </section>

          <section className="section-block client-section">
            <div className="section-header"><div><div className="section-kicker">VISÃO MULTIDISCIPLINAR</div><h2>Clientes da agência</h2><p>Todos enxergam o panorama completo. A edição respeita a função de cada agente.</p></div><div className="read-access"><Icon name="eye" size={16}/><span><strong>Leitura global</strong> para todos os departamentos</span></div></div>
            <div className="client-grid">
              {clients.map((client) => <button className="client-card" key={client.id} onClick={() => setSelectedClient(client)}>
                <div className="client-top"><div className="client-logo" style={{background:client.color,color:client.ink}}>{client.initials}</div><div className="client-name"><strong>{client.name}</strong><span>{client.segment}</span></div><span className={`status-pill ${client.health < 70 ? "warning" : client.health > 88 ? "great" : "good"}`}>{client.status}</span></div>
                <div className="client-headline"><span>MOMENTO DA MARCA</span><strong>{client.headline}</strong></div>
                <div className="health-line"><div><span>Saúde da operação</span><b>{client.health}%</b></div><div className="bar"><i style={{width:`${client.health}%`}}/></div></div>
                <div className="department-dots">{client.departments.slice(0,5).map((d) => <i key={d[0]} className={Number(d[2]) < 60 ? "low" : Number(d[2]) < 80 ? "mid" : "high"} title={String(d[0])}/>)}<span>5 áreas conectadas</span></div>
                <div className="client-next"><div><span>PRÓXIMO MARCO</span><strong>{client.next}</strong></div><div className="round-arrow"><Icon name="arrow" size={15}/></div></div>
              </button>)}
            </div>
          </section>

          <section className="lower-grid">
            <article className="work-card"><div className="card-heading"><div><span>MEU FLUXO</span><h3>O que está em movimento</h3></div><button>Ver tudo <Icon name="arrow" size={14}/></button></div><div className="task-list">
              <div className="task-row"><span className="priority high"/><div className="task-copy"><strong>{roleTask}</strong><small>Foocci · Hoje, 14h30</small></div><span className="task-status doing">Em andamento</span></div>
              <div className="task-row"><span className="priority medium"/><div className="task-copy"><strong>Responder comentário do Project Manager</strong><small>Santió · Hoje, 16h</small></div><span className="task-status review">Revisão</span></div>
              <div className="task-row"><span className="priority normal"/><div className="task-copy"><strong>Validar dependência com Design</strong><small>Sushi Cazza · Amanhã</small></div><span className="task-status waiting">Aguardando</span></div>
            </div></article>
            <article className="map-card"><div className="card-heading"><div><span>DEPARTAMENTALIZAÇÃO</span><h3>Uma agência, várias especialidades</h3></div><button onClick={() => setMapExpanded(true)}>Ampliar <Icon name="arrow" size={14}/></button></div><p className="map-intro">Todos consultam o trabalho entre si. O PM distribui, conecta e resolve dependências.</p><div className="mini-org-map"><div className="pm-node"><span>PM</span><div><strong>Project Manager</strong><small>elo central</small></div></div><div className="connector-line"/><div className="department-row"><span><Icon name="brand" size={15}/>Branding</span><span><Icon name="social" size={15}/>Social</span><span><Icon name="design" size={15}/>Design</span><span><Icon name="ads" size={15}/>Tráfego</span></div></div></article>
          </section>

          <section className="handoff-strip"><div className="handoff-title"><span className="live-dot"/><div><strong>Comunicação entre departamentos</strong><small>Handoffs coordenados pelo Project Manager</small></div></div><div className="handoff-event"><div className="handoff-avatars"><span>B</span><span>D</span></div><p><strong>Branding → Design</strong> atualizou as regras visuais da Santió</p><time>há 12 min</time></div><div className="handoff-event"><div className="handoff-avatars"><span>S</span><span>PM</span></div><p><strong>Social → PM</strong> sinalizou dependência de aprovação</p><time>há 28 min</time></div></section>
        </main>
      </section>

      {selectedClient && <div className="drawer-backdrop" onMouseDown={() => setSelectedClient(null)}><aside className="client-drawer" onMouseDown={(e) => e.stopPropagation()}><button className="close-button" onClick={() => setSelectedClient(null)} aria-label="Fechar"><Icon name="close" size={20}/></button><div className="drawer-brand"><div className="client-logo large" style={{background:selectedClient.color,color:selectedClient.ink}}>{selectedClient.initials}</div><div><span>CLIENTE</span><h2>{selectedClient.name}</h2><p>{selectedClient.segment}</p></div></div><div className="access-banner"><Icon name="eye" size={18}/><div><strong>Visão geral liberada</strong><span>Você pode consultar todas as áreas. Alterações seguem sua função.</span></div></div><div className="drawer-health"><div><span>Saúde geral da operação</span><strong>{selectedClient.health}%</strong></div><div className="bar"><i style={{width:`${selectedClient.health}%`}}/></div></div><div className="drawer-section-title"><span>PANORAMA POR DEPARTAMENTO</span><button>Histórico</button></div><div className="drawer-departments">{selectedClient.departments.map(([name,status,progress]) => <button key={name}><div className="dept-symbol"><Icon name={name === "Branding" ? "brand" : name === "Social Media" ? "social" : name === "Design" ? "design" : name === "Tráfego Pago" ? "ads" : name === "Analytics" ? "analytics" : "strategy"} size={18}/></div><div><strong>{name}</strong><span>{status}</span></div><b>{progress}%</b><Icon name="chevron" size={15}/></button>)}</div><div className="drawer-next"><span>PRÓXIMO MARCO</span><strong>{selectedClient.next}</strong><button>Ver página completa do cliente <Icon name="arrow" size={15}/></button></div></aside></div>}

      {chatOpen && <div className="drawer-backdrop" onMouseDown={() => setChatOpen(false)}><aside className="chat-drawer" onMouseDown={(e) => e.stopPropagation()}><div className="chat-head"><div className="pm-avatar">PM</div><div><strong>Project Manager</strong><span><i/> Operação ativa</span></div><button onClick={() => setChatOpen(false)} aria-label="Fechar"><Icon name="close" size={20}/></button></div><div className="chat-context"><Icon name="briefcase" size={16}/><span>Conversa interna · Todos os clientes</span></div><div className="chat-body"><div className="date-separator"><span>Hoje</span></div><div className="message pm"><small>PROJECT MANAGER · 10:42</small><p>Diego, o Design atualizou os criativos da Foocci. Você consegue validar se a narrativa continua alinhada ao calendário?</p></div><div className="message me"><small>VOCÊ · 10:46</small><p>Consigo sim. Vou revisar antes das 14h e sinalizo aqui.</p></div><div className="system-message"><Icon name="check" size={14}/> O PM vinculou esta conversa à tarefa “Calendário Foocci”.</div></div><div className="chat-composer"><textarea placeholder="Escreva para o Project Manager..."/><button aria-label="Enviar"><Icon name="send" size={18}/></button></div></aside></div>}

      {mapExpanded && <div className="modal-backdrop" onMouseDown={() => setMapExpanded(false)}><section className="org-modal" onMouseDown={(e) => e.stopPropagation()}><button className="close-button" onClick={() => setMapExpanded(false)} aria-label="Fechar"><Icon name="close" size={20}/></button><div className="org-heading"><span>MAPA DA AGÊNCIA</span><h2>Especialidades independentes.<br/><em>Operação conectada.</em></h2><p>Cada departamento executa sua especialidade, consulta o contexto completo do cliente e se comunica por meio do Project Manager.</p></div><div className="org-flow"><div className="client-origin"><Icon name="users" size={20}/><div><strong>Clientes & Projetos</strong><span>contexto compartilhado</span></div></div><div className="flow-arrow">↓</div><div className="pm-center"><span>PM</span><div><strong>Project Manager</strong><small>prioriza · distribui · conecta · acompanha</small></div><b>ELO CENTRAL</b></div><div className="org-line"/><div className="org-departments">{departments.map((d) => <article key={d.name}><div><Icon name={d.icon} size={19}/></div><strong>{d.name}</strong><span>{d.status}</span><small><i/> conectado</small></article>)}</div></div><div className="org-rule"><Icon name="eye" size={18}/><p><strong>Regra transversal:</strong> todos visualizam o panorama dos clientes; somente o departamento responsável e os níveis de gestão podem editar.</p></div></section></div>}
    </div>
  );
}
