import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main(){
  const shop = 'findash-shipping-12.myshopify.com';
  const name = 'test 1';
  const offer = await prisma.offer.findFirst({ where: { shop, name } });
  console.log(JSON.stringify({ found: Boolean(offer), offer }, null, 2));
}

main().catch((err)=>{ console.error(err); process.exit(1); }).finally(()=>prisma.$disconnect());
