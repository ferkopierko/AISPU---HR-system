import json
from app.prepare_ner import labels_for, prepare, utf16_length


def test_utf16_training_offsets_are_distinct_from_python_runtime_offsets():
    text='Profil 👩‍💻 SQL'
    labels=labels_for({'id':'cv','text':text,'skills':['SQL']})
    assert labels[0]['offset']==utf16_length(text[:text.index('SQL')])
    assert labels[0]['offset']>text.index('SQL')


def test_import_format_explicit_split_and_no_upload(tmp_path):
    source=tmp_path/'source.json'
    source.write_text(json.dumps({'documents':[{'id':'doc1','text':'Skills: SQL','skills':['SQL'],'language':'sk','dataset':'Train'},
                                             {'id':'doc2','text':'Uses Python','skills':['Python'],'language':'en-us','dataset':'Test'}]}))
    payload=prepare(source,tmp_path/'prepared','cv-training','cv-skills')
    assert payload['metadata']['multilingual'] is True and payload['stringIndexType']=='Utf16CodeUnit'
    assert payload['assets']['documents'][0]['entities'][0]['labels'][0]['category']=='Skill'
    assert (tmp_path/'prepared'/'doc1.txt').read_text()=='Skills: SQL'
