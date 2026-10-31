"""Exact-span skill precision/recall/F1 by language on the explicit held-out Test split."""
import argparse
import json
import re
from collections import defaultdict
from pathlib import Path

from .config import settings
from .prepare_ner import DEFAULT_SOURCE
from .nlp import extract, preprocess
from .nlp.providers import AzureCustomNer, canonical_skill, local_entities


def evaluate(source, provider):
    counts=defaultdict(lambda:{'tp':0,'fp':0,'fn':0,'documents':0})
    docs=json.loads(Path(source).read_text(encoding='utf-8'))['documents']
    for doc in docs:
        if doc['dataset']!='Test':continue
        text=doc['text']
        gold={(m.start(),len(m.group()),canonical_skill(skill)) for skill in doc['skills'] for m in re.finditer(rf'(?<!\w){re.escape(skill)}(?!\w)',text)}
        if provider=='azure_custom_ner':
            entities,_=AzureCustomNer(settings).extract(text)
        else:
            entities=local_entities(text,extract.extract_skills(preprocess.analyze(text)))
        predicted={(e.offset,e.length,e.skill) for e in entities}
        for language in (doc['language'],'all'):
            c=counts[language];c['tp']+=len(gold&predicted);c['fp']+=len(predicted-gold);c['fn']+=len(gold-predicted);c['documents']+=1
    for c in counts.values():
        c['precision']=round(c['tp']/(c['tp']+c['fp']),4) if c['tp']+c['fp'] else 0
        c['recall']=round(c['tp']/(c['tp']+c['fn']),4) if c['tp']+c['fn'] else 0
        c['f1']=round(2*c['tp']/(2*c['tp']+c['fp']+c['fn']),4) if 2*c['tp']+c['fp']+c['fn'] else 0
    return {'provider':provider,'dataset':'synthetic-starter (not a production benchmark)','metrics':dict(counts)}


def main():
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--source',type=Path,default=DEFAULT_SOURCE)
    parser.add_argument('--provider',choices=['local_rules','azure_custom_ner'],default='local_rules')
    args=parser.parse_args()
    if args.provider=='azure_custom_ner' and settings.ai_provider!='azure_custom_ner':
        raise SystemExit('Configure AI_PROVIDER=azure_custom_ner before running paid/quota-consuming prediction.')
    print(json.dumps(evaluate(args.source,args.provider),ensure_ascii=False,indent=2))


if __name__=='__main__': main()
