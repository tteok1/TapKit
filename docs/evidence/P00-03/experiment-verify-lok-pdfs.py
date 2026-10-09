import json,pathlib,hashlib
from pypdf import PdfReader
import pypdfium2 as pdfium
root=pathlib.Path("D:/TapKit")
r=json.loads((root/"docs/evidence/P00-03/lok-loop-three-alias.json").read_text(encoding="utf-8"))
w=pathlib.Path(r["workspace"]);out=root/"docs/evidence/P00-03";result=[]
for ext in ["docx","xlsx","pptx"]:
    p=w/("converted-"+ext+".pdf");reader=PdfReader(p);text="\n".join(page.extract_text() for page in reader.pages)
    document=pdfium.PdfDocument(str(p));rendered=[]
    for i in range(len(document)):
        dest=out/("lok-three-"+ext+"-"+str(i+1)+".png")
        document[i].render(scale=1.2).to_pil().save(dest);rendered.append(str(dest))
    row={"format":ext,"sha256":hashlib.sha256(p.read_bytes()).hexdigest(),"pages":len(reader.pages),"text":text,"titlePresent":"TapKit 隔离转换验收" in text,"rendered":rendered}
    result.append(row)
report={"scope":"Parse and render generated compatibility fixtures; not hostile-doc or portable-font acceptance","files":result}
(out/"lok-three-pdf-validation.json").write_text(json.dumps(report,ensure_ascii=False,indent=2)+"\n",encoding="utf-8")
print(json.dumps(report,ensure_ascii=False))
assert all(x["pages"]>0 and x["titlePresent"] for x in result)
