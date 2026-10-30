/** Fixed bundled program. Only validated data/spec and private staged files reach it. */
export const DATA_PROGRAM = String.raw`import csv,datetime,decimal,hashlib,html,json,math,os,pathlib,re,sys,zipfile
from decimal import Decimal as D, ROUND_HALF_UP
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError
root=pathlib.Path(sys.argv[1]); out=pathlib.Path(sys.argv[2]); mode=sys.argv[3]
config=json.loads((root/'request.json').read_text(encoding='utf-8'))
spec=config['spec']; limits=config['limits']; limit=limits['maxCells']; data_bytes=limits['maxDataBytes']
os.environ['MPLCONFIGDIR']=str(out/'mpl-cache')
os.environ['HOME']=str(out)
import pandas as pd
import openpyxl
from openpyxl.utils import get_column_letter as colletter

def fail(reason): raise ValueError(reason)
def bound(frame):
 if len(frame)>limits['maxRows'] or len(frame.columns)>limits['maxColumns'] or frame.size>limit: fail('CELL_LIMIT')
 size=0
 for row in frame.itertuples(index=False,name=None):
  for v in row:
   if isinstance(v,str) and len(v)>32000: fail('CELL_TEXT_LIMIT')
   size+=len(v.encode('utf-8'))+4 if isinstance(v,str) else 16
   if size>data_bytes: fail('DATA_BYTE_LIMIT')
 frame.attrs['dataBytes']=size
 return frame
def plain(v):
 if v is None or (isinstance(v,float) and math.isnan(v)): return None
 if isinstance(v,D):
  if not v.is_finite() or abs(v)>D('9007199254740991'): fail('NUMBER_RANGE')
  return float(v)
 if isinstance(v,(datetime.date,datetime.datetime)): return v.isoformat()
 if hasattr(v,'item'): return plain(v.item())
 if isinstance(v,float) and not math.isfinite(v): fail('NUMBER_RANGE')
 return v
def number(v,scale=None):
 try: n=D(str(v))
 except decimal.InvalidOperation: fail('INVALID_NUMBER')
 if not n.is_finite() or abs(n)>D('9007199254740991'): fail('NUMBER_RANGE')
 return n.quantize(D(10)**-scale,rounding=ROUND_HALF_UP) if scale is not None else n
def outliers(series):
 values=pd.Series([float(v) for v in series if isinstance(v,(D,int,float)) and not isinstance(v,bool)],dtype=float)
 if len(values)<4: return 0
 q1=values.quantile(0.25); q3=values.quantile(0.75); gap=q3-q1
 return int(((values<q1-1.5*gap)|(values>q3+1.5*gap)).sum())
def typed(v,c,missing,timezone='Asia/Shanghai'):
 if v is None or (isinstance(v,str) and v in missing): return None
 if c['type']=='string': return str(v)
 if c['type']=='number': return number(v,c.get('scale'))
 if c['type']=='boolean':
  if v is True or v=='true': return True
  if v is False or v=='false': return False
  fail('INVALID_BOOLEAN')
 if c['type']=='date':
  try:
   zone=ZoneInfo(timezone)
   value=datetime.datetime.fromisoformat(v.isoformat() if isinstance(v,(datetime.date,datetime.datetime)) else str(v))
   if value.tzinfo is None:
    local=value.replace(tzinfo=zone)
    if local.utcoffset()!=value.replace(tzinfo=zone,fold=1).utcoffset() or local.astimezone(datetime.timezone.utc).astimezone(zone).replace(tzinfo=None)!=value: fail('INVALID_DATE')
    value=local
   return value.astimezone(zone).isoformat()
  except ValueError: fail('INVALID_DATE')
 if c['type']=='null': fail('INVALID_NULL')
 fail('INVALID_TYPE')
def safezip(path):
 with zipfile.ZipFile(path) as z:
  entries=z.infolist()
  if len(entries)>2000 or sum(e.file_size for e in entries)>500*1024*1024: fail('ZIP_LIMIT')
  for e in entries:
   if e.file_size>100*1024*1024 or e.file_size/max(1,e.compress_size)>100: fail('ZIP_LIMIT')
   if 'vbaproject' in e.filename.lower() or 'externallinks/' in e.filename.lower(): fail('EXTERNAL_LINK')
   if e.filename.endswith('.xml'):
    xml=z.read(e)
    if b'\x00' in xml or re.search(br'<!DOCTYPE|<!ENTITY',xml,re.I): fail('XML_ENTITY')
   if e.filename.endswith('.rels'):
    text=z.read(e).decode('utf-8')
    if re.search(r'TargetMode\s*=\s*["\x27]External',text,re.I): fail('EXTERNAL_LINK')
def filters(frame,items,definitions):
 types={c['key']:c['type'] for c in definitions}
 for f in items:
  if f['field'] not in frame: fail('UNKNOWN_FIELD')
  series=frame[f['field']]; kind=types[f['field']]
  def filter_value(v):
   if v is None: return None
   if kind=='number':
    if not isinstance(v,(int,float)) or isinstance(v,bool): fail('FILTER_TYPE')
    return number(v)
   if kind=='boolean' and isinstance(v,bool): return v
   if kind in ['string','date'] and isinstance(v,str): return v
   fail('FILTER_TYPE')
  if f['op']=='eq': mask=series.isna() if f['value'] is None else series.eq(filter_value(f['value']))
  elif f['op']=='in': mask=series.isin([filter_value(v) for v in f['values']])
  else:
   if kind!='number' or f['min']>f['max']: fail('FILTER_TYPE')
   mask=series.map(lambda v:v is not None and D(str(f['min']))<=v<=D(str(f['max'])))
  frame=frame.loc[mask].reset_index(drop=True)
 return frame

if mode=='verify':
 result=json.loads((root/'analysis.json').read_text(encoding='utf-8'))
 path=root/'recalculated.xlsx'; safezip(path)
 values=openpyxl.load_workbook(path,read_only=True,data_only=True,keep_links=False)
 formulas=openpyxl.load_workbook(path,read_only=True,data_only=False,keep_links=False)
 for sheet in result['spreadsheet']['sheets']:
  ws=values[sheet['name']]; fs=formulas[sheet['name']]
  if ws.max_row!=len(sheet['rows'])+1 or ws.max_column!=len(sheet['columns']): fail('RECALC_SHAPE')
  if [c.value for c in next(ws.iter_rows(min_row=1,max_row=1))]!=[c['label'] for c in sheet['columns']]: fail('RECALC_HEADER')
  formula_cells={f['cell'] for f in sheet['formulas']}
  checked_formulas=0
  for ri,(row,formula_row) in enumerate(zip(ws.iter_rows(min_row=2),fs.iter_rows(min_row=2)),0):
   for ci,(cell,formula_cell) in enumerate(zip(row,formula_row)):
    expected=sheet['rows'][ri][ci]; found=cell.value
    coordinate=colletter(ci+1)+str(ri+2)
    if coordinate in formula_cells:
     if formula_cell.data_type!='f' or not isinstance(found,(int,float)) or isinstance(found,bool) or expected is None or abs(D(str(found))-D(str(expected)))>D('0.00000001'): fail('RECALC_MISMATCH')
     checked_formulas+=1; continue
    if formula_cell.data_type=='f': fail('RECALC_FORMULA')
    kind=sheet['columns'][ci]['type']
    if kind=='date' and expected is not None: expected=datetime.datetime.fromisoformat(expected).replace(tzinfo=None)
    if kind=='number' and expected is not None:
     if not isinstance(found,(int,float)) or isinstance(found,bool) or abs(D(str(found))-D(str(expected)))>D('0.00000001'): fail('RECALC_VALUE')
    elif found!=expected and not (found is None and expected==''): fail('RECALC_VALUE')
  if checked_formulas!=len(formula_cells): fail('RECALC_MISMATCH')
 values.close(); formulas.close()
 (out/'verified.json').write_text(json.dumps({'verified':True}),encoding='utf-8')
 sys.exit(0)

frames={}; columns={}; calculations={}; timezones={}; profiles=[]; inputs=[]; warnings=[]; input_cells=0
for index,dataset in enumerate(spec['datasets']):
 try: ZoneInfo(dataset['timezone'])
 except (ZoneInfoNotFoundError,ValueError): fail('INVALID_TIMEZONE')
 path=root/('source-'+str(index)+config['extensions'][index]); actual=hashlib.sha256(path.read_bytes()).hexdigest()
 if actual!=config['inputs'][index]['sha256']: fail('INPUT_HASH')
 inputs.append(config['inputs'][index])
 if path.suffix=='.csv':
  with path.open(encoding='utf-8-sig',newline='') as f:
   reader=csv.reader(f); headers=next(reader,None); rows=[]
   if not headers or len(headers)>200 or len(set(headers))!=len(headers): fail('INVALID_HEADER')
   for row in reader:
    if len(row)!=len(headers): fail('RAGGED_CSV')
    rows.append(row)
    if len(rows)>200000 or len(rows)*len(headers)>limit: fail('CELL_LIMIT')
 else:
  safezip(path)
  book=openpyxl.load_workbook(path,read_only=True,data_only=False,keep_links=False)
  cached=openpyxl.load_workbook(path,read_only=True,data_only=True,keep_links=False)
  name=dataset.get('sheet') or book.sheetnames[0]
  if name not in book.sheetnames: fail('MISSING_SHEET')
  ws=book[name]; cvs=cached[name]
  if ws.max_row>200001 or ws.max_column>200 or max(0,ws.max_row-1)*ws.max_column>limit: fail('CELL_LIMIT')
  ws.reset_dimensions(); cvs.reset_dimensions()
  source_rows=iter(ws.iter_rows()); cache_rows=iter(cvs.iter_rows())
  headers=[c.value for c in next(source_rows,[])]; next(cache_rows,None); rows=[]
  if not headers or len(set(headers))!=len(headers) or any(not isinstance(h,str) for h in headers): fail('INVALID_HEADER')
  allowed={'SUM','AVERAGE','COUNT','COUNTA','MIN','MAX','IF','IFERROR','ROUND','SUMIF','COUNTIF','VLOOKUP'}
  for source_row,cache_row in zip(source_rows,cache_rows):
   if len(source_row)>len(headers) and any(c.value is not None for c in source_row[len(headers):]): fail('RAGGED_CSV')
   row=[None]*len(headers)
   for ci,cell in enumerate(source_row[:len(headers)]):
    v=cell.value
    if cell.data_type=='f':
     if re.search(r'[\[\]!|@\\]|https?:|file:',v,re.I) or any(fn.upper() not in allowed for fn in re.findall(r'([A-Za-z_][A-Za-z_0-9.]*)\s*\(',v)): fail('UNSUPPORTED_FORMULA')
     value=cache_row[ci].value if ci<len(cache_row) else None
     if value is None or cache_row[ci].data_type=='e': fail('FORMULA_CACHE_MISSING')
     v=value
    row[ci]=v
   rows.append(row)
   if len(rows)>limits['maxRows'] or len(rows)*len(headers)>limit: fail('CELL_LIMIT')
  book.close(); cached.close()
 positions=[]
 for c in dataset['columns']:
  label=c['label']
  if label not in headers: fail('UNKNOWN_FIELD')
  positions.append(headers.index(label))
 data=[[typed(row[pos],c,dataset['missingValues'],dataset['timezone']) for pos,c in zip(positions,dataset['columns'])] for row in rows]
 frame=bound(pd.DataFrame(data,columns=[c['key'] for c in dataset['columns']],dtype=object))
 input_cells+=frame.size
 if input_cells>limit: fail('CELL_LIMIT')
 profiles.append({'datasetId':dataset['id'],'rows':len(frame),'duplicates':int(frame.duplicated().sum()),'columns':[{'key':c['key'],'missing':int(frame[c['key']].isna().sum()),'invalid':0,'outliers':outliers(frame[c['key']]) if c['type']=='number' else 0} for c in dataset['columns']]})
 frames[dataset['id']]=frame; columns[dataset['id']]=dataset['columns']; calculations[dataset['id']]={}
 timezones[dataset['id']]=dataset['timezone']

for op in spec['operations']:
 source=op['dataset']; frame=frames[source].copy(); cols=[dict(c) for c in columns[source]]; calc=dict(calculations[source]); kind=op['op']
 required=[op[k] for k in ['field','left','leftKey'] if k in op]
 if any(k not in frame for k in required): fail('UNKNOWN_FIELD')
 if kind=='select': frame=frame[op['columns']]; cols=[next(c for c in cols if c['key']==k) for k in op['columns']]
 elif kind=='filter': frame=filters(frame,op['filters'],cols)
 elif kind=='sort': frame=frame.sort_values(op['field'],ascending=not op['descending'],na_position='last',kind='stable').reset_index(drop=True)
 elif kind=='fill':
  c=next(c for c in cols if c['key']==op['field']); value=typed(op['value'],c,[],timezones[source]); frame[op['field']]=frame[op['field']].map(lambda v:value if v is None else v)
 elif kind=='deduplicate': frame=frame.drop_duplicates(subset=op['keys'],keep='first').reset_index(drop=True)
 elif kind=='join':
  right=frames[op['right']]; rk=op['rightKey']; lk=op['leftKey']
  if rk not in right: fail('UNKNOWN_FIELD')
  if op['duplicateKeys']=='reject' and (frame[lk].duplicated().any() or right[rk].duplicated().any()): fail('DUPLICATE_JOIN_KEY')
  if frame[lk].isna().any() or right[rk].isna().any(): fail('NULL_JOIN_KEY')
  right_counts=right[rk].value_counts()
  count=sum(int(n)*int(right_counts.get(k,0) or (op['how']=='left')) for k,n in frame[lk].value_counts().items())
  if count>200000 or count*(len(cols)+len(columns[op['right']]))>limit: fail('CELL_LIMIT')
  collisions=(set(frame.columns)&set(right.columns))-{rk} if rk==lk else set(frame.columns)&set(right.columns)
  if collisions: fail('JOIN_COLUMN_CONFLICT')
  frame=frame.merge(right,how=op['how'],left_on=lk,right_on=rk,sort=False,validate='many_to_many' if op['duplicateKeys']=='allow' else 'one_to_one').where(pd.notna,None)
  cols.extend(c for c in columns[op['right']] if c['key'] not in {c['key'] for c in cols}); calc={}
 elif kind=='split':
  if any(c in frame for c in op['columns']): fail('COLUMN_EXISTS')
  values=[str(v).split(op['separator']) if v is not None else [None]*len(op['columns']) for v in frame[op['field']]]
  if any(len(v)!=len(op['columns']) for v in values): fail('SPLIT_WIDTH')
  for i,k in enumerate(op['columns']): frame[k]=[v[i] for v in values]; cols.append({'key':k,'label':k,'type':'string','unit':''})
 elif kind=='classify':
  if op['column'] in frame: fail('COLUMN_EXISTS')
  definition=next(c for c in cols if c['key']==op['field'])
  groups=[([typed(v,definition,[],timezones[source]) for v in g['values']],g['label']) for g in op['groups']]
  def classify(v):
   for values,label in groups:
    if v in values: return label
   return op['otherwise']
  frame[op['column']]=frame[op['field']].map(classify); cols.append({'key':op['column'],'label':op['column'],'type':'string','unit':''})
 elif kind=='calculate':
  if op['column'] in frame: fail('COLUMN_EXISTS')
  right=op['right']; result=[]
  if isinstance(right,str) and right not in frame: fail('UNKNOWN_FIELD')
  left_unit=next(c['unit'] for c in cols if c['key']==op['left']); right_unit=next(c['unit'] for c in cols if c['key']==right) if isinstance(right,str) else ''
  unit=op.get('unit')
  if unit is None:
   if not left_unit: unit=right_unit if op['operator']!='divide' else ('' if not right_unit else '1/'+right_unit)
   elif not right_unit or (left_unit==right_unit and op['operator'] in ['add','subtract']): unit=left_unit
   elif left_unit==right_unit and op['operator']=='divide': unit=''
   else: fail('UNIT_REQUIRED')
  for _,row in frame.iterrows():
   a=row[op['left']]; b=row[right] if isinstance(right,str) else number(right)
   if a is None or b is None: result.append(None); continue
   a=number(a); b=number(b)
   if op['operator']=='divide' and b==0: fail('DIVIDE_BY_ZERO')
   value=a+b if op['operator']=='add' else a-b if op['operator']=='subtract' else a*b if op['operator']=='multiply' else a/b
   result.append(number(value,op['scale']))
  frame[op['column']]=result; cols.append({'key':op['column'],'label':op['column'],'type':'number','unit':unit,'scale':op['scale']})
  if op['formula']: calc[op['column']]=op
 elif kind=='aggregate':
  if any(k not in frame for k in op['groupBy']) or any(m['field'] not in frame for m in op['metrics']): fail('UNKNOWN_FIELD')
  names=op['groupBy']+[m['as'] for m in op['metrics']]
  if len(set(names))!=len(names): fail('COLUMN_EXISTS')
  groups=frame.groupby(op['groupBy'],dropna=False,sort=False) if op['groupBy'] else [((),frame)]
  result=[]
  for keys,group in groups:
   keys=keys if isinstance(keys,tuple) else (keys,); values=list(keys)
   for metric in op['metrics']:
    series=[v for v in group[metric['field']] if v is not None]
    fn=metric['function']
    if fn=='count': val=D(len(series))
    elif not series: val=None
    else:
     nums=[number(v) for v in series]
     val=sum(nums,D(0)) if fn=='sum' else sum(nums,D(0))/len(nums) if fn=='mean' else min(nums) if fn=='min' else max(nums)
    values.append(number(val,metric['scale']) if val is not None else None)
   result.append(values)
  old_cols=cols
  frame=pd.DataFrame(result,columns=names,dtype=object); cols=[next(c for c in old_cols if c['key']==k) for k in op['groupBy']]+[{'key':m['as'],'label':m['as'],'type':'number','unit':'条' if m['function']=='count' else next(c['unit'] for c in old_cols if c['key']==m['field']),'scale':m['scale']} for m in op['metrics']]; calc={}
 frames[op['output']]=bound(frame); columns[op['output']]=cols; calculations[op['output']]=calc
 timezones[op['output']]=timezones[source]

sheets=[]; total=0; output_bytes=0; workbook=openpyxl.Workbook(); workbook.remove(workbook.active)
for index,dataset in enumerate(spec['outputs']):
 frame=frames[dataset]; cols=columns[dataset]; rows=[[plain(v) for v in row] for row in frame.itertuples(index=False,name=None)]; total+=frame.size
 if total>limit: fail('CELL_LIMIT')
 output_bytes+=frame.attrs.get('dataBytes',data_bytes+1)
 if output_bytes>data_bytes: fail('DATA_BYTE_LIMIT')
 name='数据'+str(index+1); sheet={'id':dataset,'name':name,'columns':cols,'rows':rows,'formulas':[]}; ws=workbook.create_sheet(name); ws.append([c['label'] for c in cols]); ws.freeze_panes='A2'
 for cell in ws[1]: cell.data_type='s'
 for row in rows:
  ws.append(row)
  for ci,cell in enumerate(ws[ws.max_row]):
   if cols[ci]['type']=='date' and cell.value is not None:
    cell.value=datetime.datetime.fromisoformat(cell.value).replace(tzinfo=None); cell.number_format='yyyy-mm-dd hh:mm:ss'
   elif isinstance(cell.value,str): cell.data_type='s'
 for key,calc in calculations[dataset].items():
  names=[c['key'] for c in cols]
  if key not in names or calc['left'] not in names or (isinstance(calc['right'],str) and calc['right'] not in names): warnings.append('计算列导出为固定值：'+key); continue
  ci=names.index(key)+1; left=colletter(names.index(calc['left'])+1); right=calc['right']; symbol={'add':'+','subtract':'-','multiply':'*','divide':'/'}[calc['operator']]
  for ri,row in enumerate(rows,2):
   if row[ci-1] is None: continue
   rhs=colletter(names.index(right)+1)+str(ri) if isinstance(right,str) else str(right)
   formula='ROUND('+left+str(ri)+symbol+rhs+','+str(calc['scale'])+')'; cell=colletter(ci)+str(ri); ws[cell]='='+formula; sheet['formulas'].append({'cell':cell,'expression':formula})
 for ci,c in enumerate(cols,1):
  ws.column_dimensions[colletter(ci)].width=20
  if c['type']=='number':
   for row in ws.iter_rows(min_row=2,min_col=ci,max_col=ci): row[0].number_format='0'+('.'+'0'*c['scale'] if c.get('scale',0)>0 else '')
 sheets.append(sheet)
 with (out/('table-'+str(index)+'.csv')).open('x',encoding='utf-8-sig',newline='') as f:
  writer=csv.writer(f)
  def csvvalue(v): return "'"+v if spec['csvMode']=='safe' and isinstance(v,str) and re.match(r'^[\s\x00-\x1f]*[=+@-]',v) else v
  writer.writerow([csvvalue(c['label']) for c in cols]); writer.writerows([[csvvalue(v) for v in row] for row in rows])
workbook.save(out/'generated.xlsx')
if spec['csvMode']=='preserve_values': warnings.append('CSV按原值导出：电子表格应用可能将字符串解释为公式。')

import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt
from matplotlib.font_manager import FontProperties
font=FontProperties(fname=str(root/'font.otf')); plt.rcParams['svg.fonttype']='path'; plt.rcParams['axes.unicode_minus']=False
chart_html=[]
for index,chart in enumerate(spec['charts']):
 frame=filters(frames[chart['datasetId']],chart['filters'],columns[chart['datasetId']])
 if len(frame)>limits['maxChartPoints']: fail('CHART_POINT_LIMIT')
 if chart['xField'] not in frame or any(k not in frame for k in chart['yFields']): fail('UNKNOWN_FIELD')
 if any(next(c['type'] for c in columns[chart['datasetId']] if c['key']==k)!='number' for k in chart['yFields']): fail('CHART_FIELD_TYPE')
 legend_labels=[next(c['label'] for c in columns[chart['datasetId']] if c['key']==field) for field in chart['yFields']]; yfields=list(chart['yFields'])
 if chart.get('groupField'):
  group=chart['groupField']; xfield=chart['xField']
  if group not in frame or chart['type']=='pie': fail('CHART_GROUP_INVALID')
  def identity(v): return json.dumps(plain(v),ensure_ascii=False)
  records=frame.to_dict('records'); groups=list({identity(r[group]):r[group] for r in records}.values()); xs=list({identity(r[xfield]):r[xfield] for r in records}.values())
  if len(groups)*len(yfields)>6: fail('CHART_SERIES_LIMIT')
  by_key={}
  for row in records:
   key=(identity(row[group]),identity(row[xfield]))
   if key in by_key: fail('CHART_AGGREGATE_REQUIRED')
   by_key[key]=row
  descriptor=[]; legend_labels=[]
  for gi,g in enumerate(groups):
   label=plain(g)
   label='缺失' if label is None else str(int(label)) if isinstance(label,float) and label.is_integer() else str(label).lower() if isinstance(label,bool) else str(label)
   for yi,field in enumerate(yfields):
    key='__series_'+str(gi)+'_'+str(yi)
    if key==xfield: key=key+'_'
    field_label=next(c['label'] for c in columns[chart['datasetId']] if c['key']==field)
    descriptor.append((key,g,field)); legend_labels.append(re.sub(r'[\x00-\x1f]',' ',str(gi+1)+': '+label+' · '+field_label)[:80])
  frame=pd.DataFrame([[x]+[by_key.get((identity(g),identity(x)),{}).get(field) for key,g,field in descriptor] for x in xs],columns=[xfield]+[key for key,g,field in descriptor],dtype=object)
  yfields=[key for key,g,field in descriptor]
 fig,ax=plt.subplots(figsize=(9,5),dpi=140); x=list(frame[chart['xField']]); labels=[str(plain(v)) for v in x]
 if not any(v is not None for field in yfields for v in frame[field]): fail('CHART_NO_DATA')
 for yi,field in enumerate(yfields):
  values=[float(number(v)) if v is not None else float('nan') for v in frame[field]]
  label=legend_labels[yi]
  if chart['type']=='bar': ax.bar([i-.4+(yi+.5)*0.8/len(yfields) for i in range(len(x))],values,width=0.8/len(yfields),label=label)
  elif chart['type']=='line': ax.plot(range(len(x)),values,label=label,marker='o',markersize=4)
  elif chart['type']=='area': ax.fill_between(range(len(x)),values,label=label,alpha=0.45)
  elif chart['type']=='scatter': ax.scatter([float(number(v)) for v in x],values,label=label)
  else:
   if len(chart['yFields'])!=1 or any(v<0 or not math.isfinite(v) for v in values) or sum(values)<=0: fail('INVALID_PIE')
   ax.pie(values,labels=labels,textprops={'fontproperties':font})
 if chart['type'] in ['bar','line','area']: ax.set_xticks(range(len(labels)),labels,rotation=30,fontproperties=font)
 ax.set_title(chart['title'],fontproperties=font); ax.set_xlabel(chart['xLabel'],fontproperties=font); ax.set_ylabel(chart['yLabel'],fontproperties=font)
 if chart['showLegend'] and chart['type']!='pie': ax.legend(prop=font)
 fig.tight_layout(); fig.savefig(out/('chart-'+str(index)+'.svg')); fig.savefig(out/('chart-'+str(index)+'.png')); plt.close(fig)
 svg=(out/('chart-'+str(index)+'.svg')).read_text(encoding='utf-8')
 if re.search(r'<script|foreignObject|onload\s*=|(?:href|src)\s*=\s*["\x27](?!#)',svg,re.I): fail('UNSAFE_SVG')
 svg=re.sub(r'<!DOCTYPE[\s\S]*?>','',svg,flags=re.I)
 (out/('chart-'+str(index)+'.svg')).write_text(svg,encoding='utf-8')
 chart_html.append(svg[svg.index('<svg'):])
result={'schemaVersion':1,'kind':'tapkit.analysis','spec':spec,'profiles':profiles,'spreadsheet':{'schemaVersion':1,'sheets':sheets},'scriptHash':config['scriptHash'],'inputs':inputs,'warnings':warnings,'exports':[]}
(out/'analysis.json').write_text(json.dumps(result,ensure_ascii=False,allow_nan=False),encoding='utf-8')
(out/'charts.json').write_text(json.dumps(spec['charts'],ensure_ascii=False),encoding='utf-8')
report='# '+spec['title']+'\n\n问题：'+spec['question']+'\n\n统计口径：'+spec['methodology']+'\n\n'+ '\n'.join('输入 '+p['datasetId']+'：'+str(p['rows'])+' 行，重复 '+str(p['duplicates'])+' 行。' for p in profiles)+'\n\n计算依据和完整数据见 analysis.json；不对未提供事实作结论。\n'
(out/'report.md').write_text(report,encoding='utf-8')
details=''
if spec['includeDetailsInHtml']:
 for sheet in sheets:
  details+='<h2>'+html.escape(sheet['name'])+'</h2><table><thead><tr>'+''.join('<th>'+html.escape(c['label'])+'</th>' for c in sheet['columns'])+'</tr></thead><tbody>'+''.join('<tr>'+''.join('<td>'+html.escape(str(v) if v is not None else '')+'</td>' for v in row)+'</tr>' for row in sheet['rows'])+'</tbody></table>'
page='<!doctype html><html lang="zh-CN"><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="default-src &#x27;none&#x27;; style-src &#x27;unsafe-inline&#x27;; img-src data:"><title>'+html.escape(spec['title'])+'</title><style>body{font:16px system-ui;max-width:1100px;margin:32px auto;padding:16px;color:#242b27}svg{max-width:100%;height:auto}table{border-collapse:collapse}td,th{padding:8px;border:1px solid #ccd6ce}</style><h1>'+html.escape(spec['title'])+'</h1><p>'+html.escape(spec['methodology'])+'</p>'+''.join(chart_html)+details+'</html>'
(out/'dashboard.html').write_text(page,encoding='utf-8')
`;
