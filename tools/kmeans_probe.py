import numpy as np
from PIL import Image
rng=np.random.default_rng(7)
def load(p):
    return np.array(Image.open(p).convert('RGB'))
def kmeans(X,k,it=40):
    c=X[rng.choice(len(X),1)].astype(float)
    for _ in range(k-1):
        d=np.min(((X[:,None,:]-c[None])**2).sum(2),1); c=np.vstack([c,X[rng.choice(len(X),1,p=d/d.sum())]])
    for _ in range(it):
        a=((X[:,None,:]-c[None])**2).sum(2).argmin(1)
        c=np.array([X[a==i].mean(0) if (a==i).any() else c[i] for i in range(k)])
    return c,a
files=['reference/SAMPUL GOZEC JPG.jpg.jpeg','reference/GOZEC 1.jpg.jpeg']
imgs=[load(f) for f in files]
X=np.vstack([i.reshape(-1,3)[::40] for i in imgs]).astype(float)
c,a=kmeans(X,10)
cnt=np.bincount(a,minlength=10)
for i in np.argsort(-cnt):
    print(i,cnt[i],c[i].round())
