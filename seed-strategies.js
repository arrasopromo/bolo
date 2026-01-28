const mongoose = require('mongoose');
require('dotenv').config();
const FinancialStrategy = require('./models/FinancialStrategy');

const strategies = [
    // --- BELOW BREAK-EVEN STRATEGIES ---
    {
        scenario: 'below_break_even',
        title: 'Aumente o Ticket Médio (Upsell)',
        content: 'Ofereça produtos complementares no checkout. Ex: "Por apenas mais R$ 5,00 leve 2 brigadeiros". Isso aumenta o faturamento sem custo de aquisição de cliente novo.',
        source: 'Sebrae / Marketing Basics'
    },
    {
        scenario: 'below_break_even',
        title: 'Promoção Relâmpago de Estoque Parado',
        content: 'Identifique produtos com menor saída e faça uma promoção "Leve 3 Pague 2" ou descontos agressivos por 24h para gerar caixa rápido.',
        source: 'Estratégias de Varejo'
    },
    {
        scenario: 'below_break_even',
        title: 'Foco nos Produtos de Maior Margem',
        content: 'Analise sua ficha técnica e descubra qual produto tem a maior margem de lucro (não o maior preço). Concentre todo o marketing nele.',
        source: 'Contabilidade Financeira'
    },
    {
        scenario: 'below_break_even',
        title: 'Antecipação de Receita (Vouchers)',
        content: 'Venda vouchers ou cartões-presente com desconto para uso futuro. Isso traz dinheiro hoje para cobrir custos imediatos.',
        source: 'Gestão de Crise'
    },
    {
        scenario: 'below_break_even',
        title: 'Parcerias Locais (Comarketing)',
        content: 'Faça parcerias com lojas de roupas ou salões de beleza próximos. Deixe amostras grátis com QR Code para pedidos. Custo baixo e alta visibilidade.',
        source: 'Marketing de Guerrilha'
    },
    {
        scenario: 'below_break_even',
        title: 'Redução de Custos Variáveis (Desperdício)',
        content: 'Revise processos de produção para zerar desperdícios. Cada grama jogada fora é lucro a menos. Use sobras de massa para criar novos produtos (ex: bolo no pote).',
        source: 'Gestão de Produção'
    },

    // --- ABOVE BREAK-EVEN STRATEGIES ---
    {
        scenario: 'above_break_even',
        title: 'Construção de Reserva de Emergência',
        content: 'Destine 20% a 30% do lucro excedente para um fundo de reserva. O ideal é ter de 3 a 6 meses de custos fixos guardados.',
        source: 'Educação Financeira Empresarial'
    },
    {
        scenario: 'above_break_even',
        title: 'Reinvestimento em Eficiência',
        content: 'Use o lucro para comprar equipamentos que aumentem a produtividade (batedeira maior, forno melhor). Isso reduz o custo unitário a longo prazo.',
        source: 'Gestão de Crescimento'
    },
    {
        scenario: 'above_break_even',
        title: 'Diversificação de Mix de Produtos',
        content: 'Lance uma linha premium ou sazonal. Com as contas pagas, você pode correr riscos calculados para testar novos mercados.',
        source: 'Estratégia de Expansão'
    },
    {
        scenario: 'above_break_even',
        title: 'Fidelização de Clientes (LTV)',
        content: 'Invista em programas de fidelidade ou "mimos" para clientes recorrentes. É 5x mais barato manter um cliente do que conseguir um novo.',
        source: 'Kotler / Marketing'
    },
    {
        scenario: 'above_break_even',
        title: 'Marketing de Branding',
        content: 'Invista em melhorar a marca (embalagens mais bonitas, fotos profissionais). Isso permite cobrar mais caro (aumentar margem) no futuro.',
        source: 'Branding'
    }
];

const seedStrategies = async () => {
    try {
        await mongoose.connect(process.env.MONGODB_URI);
        console.log('MongoDB Connected');

        // Clear existing
        await FinancialStrategy.deleteMany({});
        console.log('Old strategies removed');

        // Insert new
        await FinancialStrategy.insertMany(strategies);
        console.log('New strategies seeded successfully');

        process.exit(0);
    } catch (err) {
        console.error('Error seeding strategies:', err);
        process.exit(1);
    }
};

seedStrategies();
