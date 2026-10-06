const{test}=require('node:test');const assert=require('node:assert/strict');const fs=require('node:fs/promises');const path=require('node:path');const os=require('node:os');const{Store}=require('../desktop/store.cjs');const{migrateProfile}=require('../desktop/migrate.cjs');
test('Profile migration includes committed WAL data and never overwrites an existing Astra profile',async t=>{
 const root=await fs.mkdtemp(path.join(os.tmpdir(),'astra-migration-'));t.after(()=>fs.rm(root,{recursive:true,force:true}));
 const legacy=new Store(path.join(root,'legacy'));legacy.set('root','C:\\Movies');legacy.set('preferences',{textScale:175,theme:'cinema'});legacy.set('queue:C:\\Movies',['stable-id']);
 assert.equal(await migrateProfile(path.join(root,'legacy'),path.join(root,'astra')),true);
 const target=new Store(path.join(root,'astra'));assert.equal(target.get('root'),'C:\\Movies');assert.equal(target.get('preferences').textScale,175);assert.deepEqual(target.get('queue:C:\\Movies'),['stable-id']);target.set('root','C:\\New');target.close();
 assert.equal(await migrateProfile(path.join(root,'legacy'),path.join(root,'astra')),false);const reopened=new Store(path.join(root,'astra'));assert.equal(reopened.get('root'),'C:\\New');reopened.close();legacy.close();
});
