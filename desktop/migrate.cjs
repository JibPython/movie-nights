const fs=require('node:fs/promises');
const path=require('node:path');
const {DatabaseSync,backup}=require('node:sqlite');
async function migrateProfile(legacy,destination) {
  const target=path.join(destination,'library.sqlite');
  try { await fs.access(target);return false; } catch(e) { if(e.code!=='ENOENT')throw e; }
  const original=path.join(legacy,'library.sqlite');
  try { await fs.access(original); } catch(e) { if(e.code==='ENOENT')return false;throw e; }
  await fs.mkdir(destination,{recursive:true});
  const staging=path.join(destination,`migration-${process.pid}.sqlite`);
  const db=new DatabaseSync(original,{readOnly:true});
  try {
    await backup(db,staging);
    // Exclusive copy prevents overwriting an existing/new Astra profile.
    await fs.copyFile(staging,target,require('node:fs').constants.COPYFILE_EXCL);
    await fs.writeFile(path.join(destination,'migration.json'),JSON.stringify({from:legacy,date:new Date().toISOString()},null,2));
    return true;
  } finally {db.close();await fs.rm(staging,{force:true});}
}
module.exports={migrateProfile};
