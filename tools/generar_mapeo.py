import json,csv,collections,re
P=json.load(open('products_singles_22.json'))['products']
G={x['idProduct']:x for x in json.load(open('price_guide_22.json'))['priceGuides']}
PI={x['idProduct']:x for x in P}
def norm(s):
  s=s.lower().replace(' - ',', ')
  s=re.sub(r'\(.*?\)','',s); s=s.replace(', starter','').replace(' starter','')
  return re.sub(r'[^a-z0-9,/]+',' ',s).strip().strip(',').strip()
def price(i,foil=False):
  x=G.get(i) or {}
  v=x.get('trend-foil' if foil else 'trend')
  return v if v else None   # 0 = sin datos
def ref(i):  # precio de referencia para ordenar variantes
  a,b=price(i),price(i,True)
  return (a or 0)+(b or 0) if (a or b) else 1e9
byname=collections.defaultdict(list)
for x in P: byname[norm(x['name'])].append(x)
MAIN={'Origins':6286,'Proving Grounds':6289,'Spiritforged':6399,'Unleashed':6491,'Vendetta':6587,'Radiance':6659}
PROMO={6322,6588,6480,6705}
out=[]
for r in csv.DictReader(open('collection1.csv')):
  cid,name,st=r['CardId'],r['Name'],r['Set']
  suf=re.match(r'^[A-Z]+-[A-Z]?\d+(.*)$',cid).group(1)
  cands=byname.get(norm(name),[])
  main=sorted([x['idProduct'] for x in cands if x['idExpansion']==MAIN[st]],key=ref)
  pick=None;conf='';why=''
  if not cands: why='No existe como single en Cardmarket (token)'
  elif suf in('-P',) or 'Promo' in name:
    pr=[x['idProduct'] for x in cands if x['idExpansion'] in PROMO]
    if len(pr)==1: pick,conf,why=pr[0],'media','Promo: único candidato en expansión de promos'
    else: why=f'Promo con {len(pr)} candidatos'
  elif suf.lower()=='a':
    if len(main)>=2: pick,conf,why=main[1],'media','Variante a/A: segunda más barata del set (alt art)'
    else: why='Variante sin alternativa en el set'
  elif suf=='':
    if len(main)==1: pick,conf,why=main[0],'alta','Único producto con ese nombre en el set'
    elif len(main)>1:
      pick=main[0]; a,b=ref(main[0]),ref(main[1])
      conf='alta' if b>=3*a else 'baja'; why=f'{len(main)} variantes en el set: la más barata es la base'
    elif len(cands)==1: pick,conf,why=cands[0]['idProduct'],'media','Único producto, en otra expansión'
    else: why='Sin producto en el set principal'
  else: why=f'Sufijo desconocido {suf}'
  n,f=int(r['Normal']),int(r['Foil'])
  pn=price(pick) if pick else None; pf=price(pick,True) if pick else None
  val=(n*(pn or 0)+f*(pf or 0)) if pick else None
  out.append(dict(CardId=cid,Name=name,Set=st,Normal=n,Foil=f,idProduct=pick or '',confianza=conf or 'sin mapear',
     motivo=why,trend=pn or '',trend_foil=pf or '',valor=round(val,2) if val is not None else '',
     candidatos=';'.join(str(x['idProduct']) for x in cands)))
c=collections.Counter(o['confianza'] for o in out); print(c)
tot=sum(o['valor'] or 0 for o in out); print('valor total',round(tot,2))
nop=[o for o in out if o['idProduct'] and o['valor']==0]; print('mapeadas sin precio:',len(nop))
sinp=[o['CardId'] for o in out if o['idProduct'] and ((o['Normal'] and not o['trend']) or (o['Foil'] and not o['trend_foil']))]
print('copias sin precio para su acabado:',len(sinp), sinp[:40])
for o in out:
  if o['confianza'] in('baja','media','sin mapear'): print(o['confianza'],o['CardId'],o['Name'],o['idProduct'],o['trend'],o['trend_foil'],'|',o['motivo'])
top=sorted([o for o in out if o['valor']],key=lambda o:-o['valor'])[:10]
for o in top: print('TOP',o['CardId'],o['Name'],o['Normal'],o['Foil'],o['valor'])
order={'sin mapear':0,'baja':1,'media':2,'alta':3}; out.sort(key=lambda o:(order[o['confianza']],o['CardId']))
w=csv.DictWriter(open('mapeo_revision.csv','w',newline=''),fieldnames=list(out[0].keys())); w.writeheader(); w.writerows(out)
json.dump({o['CardId']:{'idProduct':o['idProduct'] or None,'confianza':o['confianza']} for o in out},open('mapping.json','w'),indent=1)
