// هاد الملف يشتغل بس على السيرفر (Vercel) — الزوار ما بيقدروا يشوفوه أبداً.
// مفتاح API محفوظ بمتغيّر بيئة (Environment Variable) اسمه ANTHROPIC_API_KEY،
// منحطه لاحقاً من إعدادات Vercel نفسها، مش هون بالكود.

const SYSTEM_PROMPT = `أنت "مساعد التوظيف" — مساعد ذكاء اصطناعي متخصص حصرياً بمساعدة الناطقين بالعربي المقيمين في السويد على إيجاد عمل. تتحدث بالعربي فقط (لهجة شامية بسيطة ومفهومة، مش فصحى ثقيلة). خبرتك تشمل: كتابة CV وPersonligt brev بأسلوب سويدي، فهم آلية Arbetsförmedlingen وPlatsbanken، نصائح لمقابلات العمل بالسويد، وتوجيه الشخص لأنواع الوظائف المتاحة حسب خبرته.

عندك أداة اسمها search_jobs بتوصلك ببيانات حقيقية وحية من Arbetsförmedlingen (الجهة الرسمية بالسويد). استخدمها كل مرة الشخص بيسأل عن وظائف متاحة، حتى لو ما ذكر مدينة أو مهنة محددة — استنتج أفضل كلمات بحث من كلامه (بالسويدي إذا أمكن، لأنو البيانات الأصلية بالسويدي). إذا ما لقيت نتائج، قول هيك بصراحة واقترح كلمات بحث بديلة.

مهم جداً بخصوص تنسيق الوظائف: ممنوع منعاً باتاً استخدام جداول Markdown (يعني ممنوع رموز | و --- لعمل جدول). بدل هيك استخدم هالشكل بالضبط لكل وظيفة، مع سطر فاضي بين كل وظيفة والثانية:

1. **اسم الوظيفة**
   🏢 اسم الشركة
   📍 المدينة
   📅 آخر موعد: التاريخ
   🔗 [افتح إعلان الوظيفة](الرابط الفعلي من نتيجة البحث)

مهم: رابط التقديم لازم يكون بصيغة [نص](رابط) بالضبط متل المثال فوق — يعني كلمة "افتح إعلان الوظيفة" بين قوسين مربعين، والرابط الحقيقي بعدها بين قوسين عاديين، بدون مسافة بينهم. لا تكتب الرابط الكامل كنص عادي أبداً.

اكتب أرقام الوظائف بالتسلسل (1. 2. 3...)، واسم الوظيفة بس بخط عريض (نجمتين ** حواليه). لا تستخدم أي رموز جدول إطلاقاً.

تحذير أمان صارم: ممنوع منعاً باتاً اختراع أو تخمين أي رقم هاتف أو عنوان إيميل أو اسم شخص مسؤول عن التوظيف — هاي المعلومات غير موجودة أصلاً بنتائج البحث. إذا سألك الشخص عن رقم تلفون أو إيميل صاحب العمل، قوله بوضوح إنو هاي المعلومة مش متوفرة عندك، ووجّهه لرابط التقديم الرسمي (🔗) يلي فيه كل تفاصيل التواصل الصحيحة مباشرة من الشركة. لا تخمّن ولا تقترح رقم "على الأغلب" أو "مثال" — أي رقم أو إيميل غير حقيقي ممنوع تماماً حتى لو الشخص أصرّ.

ردودك قصيرة وعملية ومباشرة، وبأسلوب داعم ومشجّع، بدون مبالغة أو حشو.`;

const TOOLS = [
  {
    name: 'search_jobs',
    description: 'يبحث عن وظائف حقيقية ومتاحة حالياً بالسويد من قاعدة بيانات Arbetsförmedlingen الرسمية. استخدمه كل مرة الشخص يسأل عن وظائف أو فرص عمل.',
    input_schema: {
      type: 'object',
      properties: {
        query: {
          type: 'string',
          description: 'كلمات البحث، يفضل بالسويدي إذا ممكن (مثال: "städare Borås" أو "lagerarbetare Göteborg"). إذا ما تعرف الترجمة السويدية بالضبط، استخدم العربي أو الإنكليزي.'
        },
        limit: {
          type: 'integer',
          description: 'عدد النتائج المطلوبة، افتراضياً 5'
        }
      },
      required: ['query']
    }
  }
];

async function searchJobs(query, limit = 5) {
  const url = `https://jobsearch.api.jobtechdev.se/search?q=${encodeURIComponent(query)}&limit=${limit}`;
  try {
    const res = await fetch(url, { headers: { accept: 'application/json' } });
    const data = await res.json();
    const hits = (data.hits || []).map(h => ({
      headline: h.headline,
      employer: h.employer && h.employer.name,
      city: h.workplace_address && h.workplace_address.municipality,
      deadline: h.application_deadline,
      url: h.webpage_url
    }));
    return { total: data.total ? data.total.value : 0, jobs: hits };
  } catch (e) {
    return { error: 'تعذر الوصول لبيانات الوظائف حالياً' };
  }
}

module.exports = async (req, res) => {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  try {
    const { messages } = req.body || {};

    if (!Array.isArray(messages) || messages.length === 0) {
      res.status(400).json({ error: 'messages missing' });
      return;
    }

    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      res.status(500).json({ error: 'API key not configured on server' });
      return;
    }

    let workingMessages = [...messages];

    for (let round = 0; round < 3; round++) {
      const apiRes = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': apiKey,
          'anthropic-version': '2023-06-01'
        },
        body: JSON.stringify({
          model: 'claude-sonnet-4-6',
          max_tokens: 1000,
          system: SYSTEM_PROMPT,
          tools: TOOLS,
          messages: workingMessages
        })
      });

      const data = await apiRes.json();

      if (!apiRes.ok) {
        console.error('ANTHROPIC API ERROR:', apiRes.status, JSON.stringify(data));
        res.status(apiRes.status).json(data);
        return;
      }

      if (data.stop_reason !== 'tool_use') {
        res.status(200).json(data);
        return;
      }

      const toolUseBlock = data.content.find(c => c.type === 'tool_use');
      let toolResultContent = '';

      if (toolUseBlock && toolUseBlock.name === 'search_jobs') {
        const result = await searchJobs(toolUseBlock.input.query, toolUseBlock.input.limit || 5);
        toolResultContent = JSON.stringify(result);
      } else {
        toolResultContent = JSON.stringify({ error: 'أداة غير معروفة' });
      }

      workingMessages = [
        ...workingMessages,
        { role: 'assistant', content: data.content },
        {
          role: 'user',
          content: [
            {
              type: 'tool_result',
              tool_use_id: toolUseBlock.id,
              content: toolResultContent
            }
          ]
        }
      ];
    }

    res.status(200).json({ content: [{ type: 'text', text: 'عذراً، صار في تأخير بجلب البيانات. جرب كمان مرة.' }] });
  } catch (err) {
    console.error('CHAT API ERROR:', err && err.stack ? err.stack : err);
    res.status(500).json({ error: err && err.message ? err.message : 'server error' });
  }
};
