"""Build Microsoft Custom NER import files from reviewed synthetic annotations. No upload."""
import argparse
import json
import re
from pathlib import Path

DEFAULT_SOURCE = Path(__file__).resolve().parents[2] / 'sample-data' / 'azure-ner' / 'starter.json'


def utf16_length(text):
    return len(text.encode('utf-16-le')) // 2


def labels_for(document):
    labels=[]
    for skill in document['skills']:
        matches=list(re.finditer(rf'(?<!\w){re.escape(skill)}(?!\w)',document['text']))
        if not matches:
            raise ValueError(f"Annotation {skill!r} not found in {document['id']}")
        for match in matches:
            labels.append({'category':'Skill','offset':utf16_length(document['text'][:match.start()]),'length':utf16_length(match.group())})
    return sorted(labels,key=lambda label:label['offset'])


def prepare(source, output, container, project):
    if not re.fullmatch(r'[a-z0-9](?:[a-z0-9-]{1,61})[a-z0-9]',container) or '--' in container:
        raise ValueError('Use a valid Blob container name (3–63 lower-case characters)')
    if not re.fullmatch(r'[A-Za-z0-9_.-]{1,50}',project):
        raise ValueError('Invalid project name')
    dataset=json.loads(Path(source).read_text(encoding='utf-8'))
    output=Path(output)
    output.mkdir(parents=True,exist_ok=True)
    documents=[]
    seen=set()
    for document in dataset['documents']:
        if not re.fullmatch(r'[A-Za-z0-9]+',document['id']) or document['id'] in seen:
            raise ValueError('Document IDs must be unique alphanumeric names')
        seen.add(document['id'])
        if document['dataset'] not in ('Train','Test'):
            raise ValueError('Explicit Train/Test split required')
        name=document['id']+'.txt'
        labels=labels_for(document)
        (output/name).write_text(document['text'],encoding='utf-8',newline='')
        documents.append({'location':name,'language':document['language'],'dataset':document['dataset'],
                          'entities':[{'regionOffset':0,'regionLength':utf16_length(document['text']),'labels':labels}]})
    payload={'projectFileVersion':'2022-05-01','stringIndexType':'Utf16CodeUnit',
             'metadata':{'projectKind':'CustomEntityRecognition','storageInputContainerName':container,'projectName':project,
                         'multilingual':True,'description':'Synthetic starter CV skills; review and extend before production','language':'sk','settings':{}},
             'assets':{'projectKind':'CustomEntityRecognition','entities':[{'category':'Skill'}],'documents':documents}}
    (output/'labels.json').write_text(json.dumps(payload,ensure_ascii=False,indent=2),encoding='utf-8')
    return payload


def main():
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--source',type=Path,default=DEFAULT_SOURCE)
    parser.add_argument('--output',type=Path,required=True)
    parser.add_argument('--container',required=True)
    parser.add_argument('--project',default='cv-skills')
    args=parser.parse_args()
    payload=prepare(args.source,args.output,args.container,args.project)
    print(f"Prepared {len(payload['assets']['documents'])} synthetic documents and labels.json. Nothing uploaded.")


if __name__=='__main__': main()
