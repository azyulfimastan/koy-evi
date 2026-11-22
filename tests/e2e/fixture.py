import os
import random
random.seed(11)
def uid(): return "".join(random.choice("abcdefghijklmnop0123456789") for _ in range(8))
C={"bed":"#c9b49a","sit":"#8c9aa6","eat":"#a07a52","kit":"#e8e2d6","bath":"#f4f6f7","heat":"#5a5550","oth":"#b9a58a"}
def W(walls,a,b,t):
    i=uid(); walls.append({"id":i,"a":{"x":a[0],"y":a[1]},"b":{"x":b[0],"y":b[1]},"t":t,"color":"#cccccc"}); return i
def O(ops,wall,pos,w,h,sill,kind,shape="rect",flip=False):
    ops.append({"id":uid(),"wall":wall,"pos":pos,"w":w,"h":h,"sill":sill,"kind":kind,"shape":shape,"flip":flip,"hinge":False})
def I(items,key,name,shape,x,y,rot,w,d,h,color,elev=0):
    items.append({"id":uid(),"key":key,"name":name,"shape":shape,"x":x,"y":y,"rot":rot,"w":w,"d":d,"h":h,"elev":elev,"color":color})
def R(rooms,name,x,y,color,floor):
    rooms.append({"id":uid(),"name":name,"seed":{"x":x,"y":y},"color":color,"floor":floor})
def house():
    # zemin kat
    w=[];o=[];r=[];it=[];st=[]
    n=W(w,(0,0),(10,0),0.3); e=W(w,(10,0),(10,8),0.3); s=W(w,(10,8),(0,8),0.3); wst=W(w,(0,8),(0,0),0.3)
    mid=W(w,(0,4.5),(10,4.5),0.15); k1=W(w,(6,0),(6,4.5),0.15); b1=W(w,(4,4.5),(4,8),0.15); b2=W(w,(6,4.5),(6,8),0.15)
    O(o,s,3,1.0,2.2,0,"door"); O(o,s,8,1.2,1.4,0.9,"window"); O(o,s,5,0.6,0.6,1.5,"window")
    for p in (1.8,4.2): O(o,n,p,1.2,1.4,0.9,"window")
    O(o,n,8,1.2,1.2,1.0,"window"); O(o,wst,6,1.2,1.4,0.9,"window"); O(o,wst,2,1.2,1.4,0.9,"window"); O(o,e,2,1.2,1.2,1.0,"window"); O(o,e,6,0.8,1.2,1.0,"window")
    O(o,mid,2.5,0.9,2.1,0,"door"); O(o,mid,5,0.8,2.1,0,"door",flip=True); O(o,mid,7.2,0.9,2.1,0,"door"); O(o,k1,2.6,1.2,2.2,0,"door","arch")
    R(r,"Salon",3,2,"#f3d9a6","parquet"); R(r,"Mutfak",8,2,"#cfe3d0","fayans"); R(r,"Yatak odası",2,6.2,"#d9d2ef","laminate"); R(r,"Banyo",5,6.2,"#cde6f2","fayans"); R(r,"Hol",8,6.2,"#eadfcf","marble")
    I(it,"sofa3","Üçlü kanepe","sofa",2.6,0.65,0,2.2,0.95,0.85,C["sit"]); I(it,"coffee","Orta sehpa","rect",2.6,1.9,0,1.0,0.6,0.45,"#8a6a4a")
    I(it,"rug","Halı (2 × 3 m)","rug",2.6,1.9,90,2.0,3.0,0.02,"#c98f7a"); I(it,"arm","Koltuk","sofa",0.75,2.3,270,0.9,0.9,0.85,C["sit"])
    I(it,"tv","TV ünitesi","rect",2.6,4.2,180,1.8,0.4,0.5,"#6b5440"); I(it,"stove","Odun sobası","stove",5.4,3.7,180,0.5,0.5,0.9,C["heat"]); I(it,"shelf","Kitaplık","rect",4.9,0.33,0,0.9,0.3,2.0,"#8a6a4a")
    I(it,"plant","Saksı bitkisi","round",0.5,0.5,0,0.4,0.4,1.2,"#5d8a4a")
    I(it,"counter120","Mutfak tezgâhı (120 cm)","rect",6.75,0.45,0,1.2,0.6,0.9,C["kit"]); I(it,"cooker","Ocak / fırın","cooker",7.65,0.45,0,0.6,0.6,0.9,C["kit"])
    I(it,"sinkK","Evye","sink",8.6,0.45,0,1.2,0.6,0.9,C["kit"]); I(it,"fridge","Buzdolabı","rect",9.48,0.5,0,0.7,0.7,1.8,"#eef0f2")
    I(it,"upper","Mutfak üst dolabı","rect",6.75,0.33,0,1.2,0.35,0.7,C["kit"],1.4); I(it,"hood","Aspiratör","rect",7.65,0.4,0,0.6,0.5,0.2,"#b8bcc0",1.65)
    I(it,"table4","Yemek masası (4 kişilik)","rect",8.0,2.6,0,1.4,0.8,0.75,C["eat"])
    for (x,y,rr) in ((7.55,2.0,180),(8.45,2.0,180),(7.55,3.2,0),(8.45,3.2,0)): I(it,"chair","Sandalye","chair",x,y,rr,0.45,0.45,0.9,C["eat"])
    I(it,"bed2","Çift kişilik yatak","bed",1.8,6.85,180,1.6,2.0,0.5,"#d9c3a0"); I(it,"night","Komodin","rect",0.6,7.6,180,0.45,0.4,0.5,"#9a7b5a"); I(it,"night","Komodin","rect",3.0,7.6,180,0.45,0.4,0.5,"#9a7b5a")
    I(it,"ward2","Gardırop (kapaklı küçük)","wardrobe",3.35,4.86,0,1.0,0.55,2.1,"#b59472")
    I(it,"wc","Klozet","toilet",4.45,7.45,180,0.4,0.7,0.8,C["bath"]); I(it,"vanity","Lavabo dolabı","sink",5.45,7.6,180,0.8,0.45,0.85,C["bath"]); I(it,"shower","Duş teknesi","shower",4.55,5.1,0,0.9,0.9,0.1,C["bath"])
    I(it,"shoe","Ayakkabılık","rect",6.6,7.65,180,0.8,0.35,1.0,"#b9a58a")
    st.append({"id":uid(),"kind":"U","x":9.0,"y":6.25,"rot":0,"w":0.9,"mirror":False})
    f0={"id":uid(),"name":"Zemin kat","height":2.8,"walls":w,"openings":o,"rooms":r,"stairs":st,"items":it}
    # 1. kat
    w=[];o=[];r=[];it=[]
    n=W(w,(0,0),(10,0),0.3); e=W(w,(10,0),(10,8),0.3); s=W(w,(10,8),(0,8),0.3); wst=W(w,(0,8),(0,0),0.3)
    mid=W(w,(0,4.5),(10,4.5),0.15); m2=W(w,(5,0),(5,4.5),0.15); b1=W(w,(4,4.5),(4,8),0.15); b2=W(w,(6,4.5),(6,8),0.15)
    for p in (2,8): O(o,s,p,1.2,1.4,0.9,"window")
    O(o,s,5,0.6,0.6,1.5,"window")
    for p in (2.5,7.5): O(o,n,p,1.2,1.4,0.9,"window")
    O(o,wst,2,1.2,1.4,0.9,"window"); O(o,wst,6,1.2,1.4,0.9,"window"); O(o,e,2,1.2,1.4,0.9,"window")
    O(o,mid,2.5,0.9,2.1,0,"door"); O(o,mid,7.5,0.9,2.1,0,"door"); O(o,b1,1.5,0.8,2.1,0,"door")
    R(r,"Çocuk odası",2.5,2,"#f6d6c8","laminate"); R(r,"Yatak odası 2",7.5,2,"#d9d2ef","parquet"); R(r,"Oda 3",2,6.2,"#e3efd0","laminate"); R(r,"Banyo 2",5,6.2,"#cde6f2","fayans"); R(r,"Hol",8,6.2,"#eadfcf","parquet")
    I(it,"bed1","Tek kişilik yatak","bed",0.75,1.2,0,0.9,2.0,0.5,"#9fc3d9"); I(it,"kdesk","Çocuk çalışma masası","rect",3.8,0.45,0,1.0,0.55,0.7,"#d8b48a")
    I(it,"bed2","Çift kişilik yatak","bed",7.5,1.2,0,1.6,2.0,0.5,"#d9c3a0"); I(it,"ward","Gardırop","wardrobe",7.5,4.05,180,1.8,0.6,2.2,"#b59472")
    I(it,"tub","Küvet","tub",5.0,7.0,0,0.75,1.7,0.55,C["bath"])
    f1={"id":uid(),"name":"1. kat","height":2.7,"walls":w,"openings":o,"rooms":r,"stairs":[],"items":it}
    objs=[]
    def E(kind,name,x,y,w,d,h,color,rot=0): objs.append({"id":uid(),"kind":kind,"name":name,"x":x,"y":y,"rot":rot,"w":w,"d":d,"h":h,"color":color})
    E("tree","Ağaç",-2,-2.5,4,4,7,"#5b8f3c"); E("tree","Ağaç",13.5,9,3.5,3.5,6,"#6a9a40"); E("pine","Çam",14,-3,3,3,9,"#2f6a3a"); E("pine","Çam",-2.5,9.5,2.6,2.6,8,"#2f6a3a")
    E("bush","Çalı",1,9.2,1.2,1.2,0.9,"#5d8a4a"); E("bush","Çalı",5.5,9.3,1.0,1.0,0.8,"#6a9a50")
    E("road","Yol",6,13,30,5,0.05,"#5e5e5e"); E("fence","Çit",6,11,20,0.08,1.0,"#8a6a4a"); E("building","Komşu bina",24,2,8,7,5.5,"#e2d6c2")
    return {"plot":{"points":[{"x":-4,"y":-5},{"x":16,"y":-5},{"x":16,"y":11},{"x":-4,"y":11}],"closed":True},"snap":0.1,"defT":0.25,
      "roof":{"kind":"gable","pitch":35,"overhang":0.5,"ridge":"auto","color":"#a5523a","tex":"tile"},"floors":[f0,f1],"custom":[],
      "fin":{"extColor":"#efe6d6","extTex":"plain","intColor":"#f4f0e8","intTex":"plain","doorColor":"#7a4a2a","frameColor":"#ffffff","groundColor":"#8fb45f"},
      "env":{"sun":{"month":6,"hour":15,"lat":52,"north":0,"shadows":True},"objs":objs}}
