const {
  Client,
  GatewayIntentBits,
  REST,
  Routes,
  SlashCommandBuilder
} = require("discord.js");

const fetch = require("node-fetch");
const fs = require("fs");
const cron = require("node-cron");

const TOKEN = process.env.DISCORD_TOKEN;
const GUILD_ID = process.env.GUILD_ID;
const CLIENT_ID = process.env.CLIENT_ID;

const VERIFIED_WALLET_ROLE_ID = "1498390601199255794";

const WAX_API = "https://wax.api.atomicassets.io/atomicassets/v1/assets";

const LEVEL_FIELDS = ["level","Level","tier","Tier","lvl","Lvl"];

const WALLETS_FILE = "./wallets.json";

let verifiedWallets = {};

function loadWallets(){
  if(!fs.existsSync(WALLETS_FILE)) return {};
  return JSON.parse(fs.readFileSync(WALLETS_FILE));
}

function saveWallets(wallets){
  verifiedWallets = wallets;
  fs.writeFileSync(WALLETS_FILE,JSON.stringify(wallets,null,2));
}

const ROLE_RULES = [

  // Chronicles
  {
    type:"simple_template",
    name:"📜 Archive_Keeper",
    roleId:"1497994063465545890",
    templateId:"680277",
    quantity:1
  },

  {
    type:"simple_template",
    name:"📚 Lore_Archivist",
    roleId:"1497994272094290073",
    templateId:"776806",
    quantity:1
  },

  {
    type:"simple_template",
    name:"📖 Master_Historian",
    roleId:"1497994442383032461",
    templateId:"776806",
    quantity:3
  },

  // Factory

  {
    type:"tiered_template",
    group:"factory",
    name:"⚙️ Factory_Operator",
    roleId:"1497992602077630597",
    templateId:"708905",
    minLevel:3
  },

  {
    type:"tiered_template",
    group:"factory",
    name:"🏭 Production_Manager",
    roleId:"1497992304584167574",
    templateId:"708905",
    minLevel:6
  },

  {
    type:"tiered_template",
    group:"factory",
    name:"🏭 Industrial_Tycoon",
    roleId:"1497993072481406986",
    templateId:"708905",
    minLevel:9
  },

  // Workforce

  {
    type:"tiered_template",
    group:"workforce",
    name:"👷 Workforce_Foreman",
    roleId:"1497992827131527319",
    templateId:"708902",
    minLevel:3
  },

  {
    type:"tiered_template",
    group:"workforce",
    name:"👷 Workforce_Supervisor",
    roleId:"1497993473033244893",
    templateId:"708902",
    minLevel:6
  },

  {
    type:"tiered_template",
    group:"workforce",
    name:"👷 Workforce_Commander",
    roleId:"1497993654164263074",
    templateId:"708902",
    minLevel:9
  },

  // Tech Center

  {
    type:"tiered_template",
    group:"tech",
    name:"🧪 Innovation_Engineer",
    roleId:"1497996265332674660",
    templateId:"768499",
    minLevel:1
  },

  {
    type:"tiered_template",
    group:"tech",
    name:"🧠 Chief_Technology_Architect",
    roleId:"1497996511139725383",
    templateId:"768499",
    minLevel:3
  },

  // Military

  {
    type:"tiered_template",
    group:"military",
    name:"🪖 Tactical_Commander",
    roleId:"1497997983910989987",
    templateId:"711919",
    minLevel:1
  },

  {
    type:"tiered_template",
    group:"military",
    name:"🛡 Defense_Strategist",
    roleId:"1497997778893275427",
    templateId:"711919",
    minLevel:2
  },

  {
    type:"tiered_template",
    group:"military",
    name:"⚔️ War_Logistics_Director",
    roleId:"1497997553747366069",
    templateId:"711919",
    minLevel:3
  },

  {
    type:"tiered_template",
    group:"military",
    name:"🔥 Supreme_Military_Commander",
    roleId:"1497997103019069521",
    templateId:"711919",
    minLevel:4
  },

  // Machines

  {
    type:"machine_set",
    group:"machines",
    name:"🔧 Machine_Operator",
    roleId:"1498385988206989312",
    templateIds:["708910","708908","708907","708906"],
    minLevel:3
  },

  {
    type:"machine_set",
    group:"machines",
    name:"⚙️ Machine_Specialist",
    roleId:"1498386192104951828",
    templateIds:["708910","708908","708907","708906"],
    minLevel:6
  },

  {
    type:"machine_set",
    group:"machines",
    name:"🏭 Machine_Master",
    roleId:"1498386362276253887",
    templateIds:["708910","708908","708907","708906"],
    minLevel:9
  },

  // Neon Genesis

  {
    type:"all_templates",
    name:"🌟 Neon_Genesis_Founder",
    roleId:"1497999187944538264",
    templateIds:["452006","452005","452004","452003","452002"],
    quantityEach:1
  },

  // 🔥 War Overlord

  {
    type:"tiered_quantity",
    name:"🔥 War_Overlord",
    roleId:"1497831114650288209",
    templateId:"711919",
    minLevel:4,
    quantity:3
  },

  // 👑 Supreme Architect

  {
    type:"supreme_architect",
    name:"👑 Supreme_Architect_of_NiftyKicks",
    roleId:"1497998180623585531"
  }

];

function getTemplateId(asset){
  return asset.template?.template_id;
}

function getLevel(asset){

  for(const src of [asset.mutable_data,asset.data,asset]){
    if(!src) continue;

    for(const field of LEVEL_FIELDS){
      if(src[field]!==undefined){
        return parseInt(src[field]);
      }
    }
  }

  return 0;
}

function countTemplates(assets){

  const counts={};

  for(const asset of assets){

    const template=getTemplateId(asset);

    if(!template) continue;

    counts[template]=(counts[template]||0)+1;

  }

  return counts;
}

function qualifiesForRule(rule,assets,counts){

  if(rule.type==="simple_template"){
    return (counts[rule.templateId]||0)>=rule.quantity;
  }

  if(rule.type==="tiered_template"){
    return assets.some(a=>
      getTemplateId(a)==rule.templateId &&
      getLevel(a)>=rule.minLevel
    );
  }

  if(rule.type==="tiered_quantity"){
    const qty=assets.filter(a=>
      getTemplateId(a)==rule.templateId &&
      getLevel(a)>=rule.minLevel
    ).length;

    return qty>=rule.quantity;
  }

  if(rule.type==="machine_set"){
    return rule.templateIds.every(id=>
      assets.some(a=>
        getTemplateId(a)==id &&
        getLevel(a)>=rule.minLevel
      )
    );
  }

  if(rule.type==="all_templates"){
    return rule.templateIds.every(id=>
      (counts[id]||0)>=rule.quantityEach
    );
  }

  if(rule.type==="supreme_architect"){

    const factory=assets.filter(a=>getTemplateId(a)==708905 && getLevel(a)>=9).length;
    const labor=assets.filter(a=>getTemplateId(a)==708902 && getLevel(a)>=9).length;
    const military=assets.filter(a=>getTemplateId(a)==711919 && getLevel(a)>=4).length;
    const tech=assets.filter(a=>getTemplateId(a)==768499 && getLevel(a)>=3).length;

    const machines=[
      "708910","708908","708907","708906"
    ].every(id=>
      assets.some(a=>getTemplateId(a)==id && getLevel(a)>=9)
    );

    const chronicles=(counts["776806"]||0)>=3;

    return factory>=2 && labor>=4 && military>=3 && tech>=1 && machines && chronicles;

  }

  return false;

}
