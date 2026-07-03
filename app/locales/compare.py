import json, sys

def load(path):
    with open(path, 'r', encoding='utf-8') as f:
        return json.load(f)

en=load(r'C:\Users\logga\Documents\ltth_codex\ltth_desktop2-main\app\locales\en.json')
fr=load(r'C:\Users\logga\Documents\ltth_codex\ltth_desktop2-main\app\locales\fr.json')

# recursive compare
identical=[]

def compare(d1,d2, path=''):
    if isinstance(d1, dict) and isinstance(d2, dict):
        for k in d1:
            if k in d2:
                compare(d1[k], d2[k], path+'.'+k if path else k)
    elif isinstance(d1, str) and isinstance(d2, str):
        if d1==d2:
            identical.append((path,d1))

compare(en,fr)
print('identical count',len(identical))
for p,val in identical:
    print(p,val)
