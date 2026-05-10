import { CaretRight, CaretLeft, X, UserCircle } from '@phosphor-icons/react';
import { useRef, useState, useEffect } from 'react';
import { ScrollAnimation } from './ScrollAnimations';
import { useUI } from '../context/UIContext';

export function Testimonials() {
  // This component is lazy loaded, content-visibility handled by parent
  const { setIsReviewSheetOpen } = useUI();
  const scrollRef = useRef<HTMLDivElement>(null);
  const [canScrollLeft, setCanScrollLeft] = useState(true);
  const [canScrollRight, setCanScrollRight] = useState(false);
  const [selectedReview, setSelectedReview] = useState<number | null>(null);

  // Sync with global UI state
  useEffect(() => {
    setIsReviewSheetOpen(selectedReview !== null);
  }, [selectedReview, setIsReviewSheetOpen]);

  // Lock body scroll when bottom sheet is open
  useEffect(() => {
    if (selectedReview !== null) {
      // Calculate scrollbar width
      const scrollbarWidth = window.innerWidth - document.documentElement.clientWidth;

      // Simply prevent scrolling without changing position
      document.documentElement.style.overflow = 'hidden';
      document.body.style.overflow = 'hidden';
      document.body.style.paddingRight = `${scrollbarWidth}px`;

      // Add padding to fixed navbar to prevent shift
      const navbar = document.querySelector('nav[role="navigation"]');
      if (navbar instanceof HTMLElement) {
        navbar.style.paddingRight = `${scrollbarWidth}px`;
      }

      return () => {
        // Restore everything
        document.documentElement.style.overflow = '';
        document.body.style.overflow = '';
        document.body.style.paddingRight = '';

        // Restore navbar padding
        if (navbar instanceof HTMLElement) {
          navbar.style.paddingRight = '';
        }

        // Clear the review sheet state
        setIsReviewSheetOpen(false);
      };
    }
  }, [selectedReview]);

  // Handle closing the review sheet
  const closeReviewSheet = () => {
    setSelectedReview(null);
    setIsReviewSheetOpen(false);
  };

  const checkScrollButtons = () => {
    if (scrollRef.current) {
      const { scrollLeft, scrollWidth, clientWidth } = scrollRef.current;
      const maxScrollLeft = scrollWidth - clientWidth;

      // RTL scroll handling is inconsistent across browsers/engines:
      // Type 1 (Standard/Blink): Start (Right) = 0, End (Left) = -Max (negative values)
      // Type 2 (Positive): Start (Right) = Max, End (Left) = 0 (positive values decreasing)

      let isAtStartRight = false; // Rightmost position - should hide Right Arrow
      let isAtEndLeft = false; // Leftmost position - should hide Left Arrow

      // Check if we are dealing with positive values (Type 2)
      if (scrollLeft > 5) {
        // We are likely in Type 2 (Start=Max, End=0)
        isAtStartRight = Math.abs(scrollLeft - maxScrollLeft) < 10;
        isAtEndLeft = scrollLeft < 10;
      } else {
        // We are likely in Type 1 (Start=0, End=-Max)
        isAtStartRight = Math.abs(scrollLeft) < 10;
        // Check absolute value against max
        isAtEndLeft = Math.abs(scrollLeft) > maxScrollLeft - 10;
      }

      setCanScrollLeft(!isAtEndLeft);
      setCanScrollRight(!isAtStartRight);
    }
  };

  const scroll = (direction: 'left' | 'right') => {
    if (scrollRef.current) {
      const scrollAmount = 412;
      const currentScroll = scrollRef.current.scrollLeft;
      // Both RTL models decrease value to go Left and increase to go Right
      // Type 1: 0 -> -412 (Left)
      // Type 2: Max -> Max-412 (Left)
      const newScrollLeft = currentScroll + (direction === 'left' ? -scrollAmount : scrollAmount);
      scrollRef.current.scrollTo({
        left: newScrollLeft,
        behavior: 'smooth',
      });
      setTimeout(checkScrollButtons, 500);
    }
  };

  // Set up scroll and resize event listeners
  useEffect(() => {
    const timer = setTimeout(checkScrollButtons, 200);
    const scrollContainer = scrollRef.current;

    if (scrollContainer) {
      scrollContainer.addEventListener('scroll', checkScrollButtons, { passive: true });
      window.addEventListener('resize', checkScrollButtons);
      return () => {
        clearTimeout(timer);
        scrollContainer.removeEventListener('scroll', checkScrollButtons);
        window.removeEventListener('resize', checkScrollButtons);
      };
    }
    return () => clearTimeout(timer);
  }, []);

  // Handle keyboard events for closing the review sheet
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        closeReviewSheet();
      }
    };

    if (selectedReview !== null) {
      window.addEventListener('keydown', handleKeyDown);
    }

    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [selectedReview]);

  const testimonials = [
    {
      name: 'إسراء',
      role: 'متدربة - دورة UI/UX',
      content:
        'بالنِّسبة للأستاذ أيهم هاد مو تقييم إنَّما تعبير بسيط عن شخصيتك ومهنتك بدون مجاملة الأستاذ الأوَّل من يلِّي قابلتهن بهالطَّريق طبعًا مع بعض الأساتذة المميَّزين شخص مثالي حكيم وعقليتك رايقة كتير وشخصيتك الإيجابيَّة. صح في شغلات ما اتَّفقنا عليها بس ما بنكر إنِّي بقول كتير من كلامك نعم. وشكرًا كتير عكلشي من تعليم ومدح وتنمُّر ههههه وعنجد كتير من الشُّكر من القلب.',
      image: '👩🎓',
    },
    {
      name: 'لمياء طرابيشي',
      role: 'متدربة - دورة UI/UX',
      content:
        'بدِّي أقلَّك شكرًا كتير، شكرًا على كلشي قدَّمتلِّي ياه وعلى كل معلومة عطيتني ياها ما قصَّرت معي بشي وكنت حدا كتير دقيق بكل كلمة حكيتا لتوصل المعلومة بشكل دقيق وصحيح. إن شاء اللّٰه يكون عجبك المشروع وتشوف جزء من تعبك علي أكون عملت شي منيح، المشروع ما كان بس مجرَّد مشروع وبدِّي أخلصو أو بدِّي أعملو بس لأنُّو عندي مشروع لازم سلمو، حاولت أستفيد من كلشي حاولت أجمع كل حرف وكل تفصيل عطيتني ياه لحتَّى تشوف تعبك، المشروع كان إلي شي مهم كتير. وهلَّق بدِّي أقلَّك شكرًا على نصايحك وشكرًا على اللوحة يلِّي انرسمت طول فترة الكورس. بدِّي أقلَّك شكرًا، أنت كنت جزء كتير كبير من أنُّو لاقي شي أحبُّو وكمان أثبت لأهلي أنُّو ما بدِّي مساعدة من شخص أو واسطة. وهلَّق بدِّي أقلَّك شي سلبي عن الكورس... مافي! لأنُّو ما حدا بيطلعلو يحكي عن كورسك ولا على إعطائك ولا حرف حتَّى أسلوبك وكلشي بتعملو وحتَّى التَّشدُّد لصالحنا أكيد، خلِّيك متل ما أنت. كورسك فخامة بكل معنى الكلمة، مالك حدا تجاري بالإعطاء، أنت حدا بيعطي بضمير، ما بقا حدا متلك جد.',
      image: '👩💼',
    },
    {
      name: 'محمَّد السَّيِّد',
      role: 'متدرب - دورة UI/UX',
      content:
        'كانت دورة مفيدة وممتعة وممتازة. الحمد للّٰه استفدت منها وما ندمت باتِّخاذ قرار دخول المجال أبدًا وخاصَّةََ بعد فهمو. الحلو أنُّو عطيت الشِّي المهم بالبرنامج والمهنة إجمالًا. بالنِّسبة للسَّلبيَّات صدقًا وبدون مجاملات ما لقيت سلبيَّات. لا شكَّ في خبرة الأستاذ أيهم، ولا في عمق معرفته واتِّساع رؤيته. تعلَّمتُ على يديه، وكان من أفضل من قدَّم المعلومة بأسلوبٍ منهجيٍّ واضح، يجمع بين التَّأصيل العملي والبُعد التَّطبيقي. كانت دورته من أجمل ما حضرت، لما فيها من ترتيب، وحرصٍ على الفائدة الحقيقيَّة، وبُعدٍ عن الحشو والتَّكرار. كلُّ من تتلمذ عنده يدرك أنَّه لا يعلِّم فحسب، بل يزرع شغفًا وطموحًا نحو التَّميُّز.',
      image: '👨💻',
    },
    {
      name: 'ليلى ورَّاق',
      role: 'متدربة - دورة UI/UX',
      content:
        'واللّٰه يا أستاذ أنا أكتر من ممنونة على كل معلومة أخدناها وحتَّى لو أنُّو الأسلوب و التَّعليقات كانت جزلة بس مفيدة جدًّا. أسلوب حدا آكل هم اللي قدَّامو و ناوي يطلع منُّو بشي. اللّٰه يجزيك الخير و يعطيك العافية على كلشي. شكرًا أستاذ أيهم.',
      image: '👩🎓',
    },
    {
      name: 'نور ضعيف',
      role: 'متدربة - دورة UI/UX',
      content:
        'يمكن خبَّرتك عن تجربتي بالكورس السَّابق شقد كانت سيئة، بعدا صرت أحضر يوتيوب ضعت أكتر ما كنت ضايعة وتركت فترة. رجعت حضرت ورشات وتركت من نصُّن رغم أنُّون أسماء معروفة بس ما حبِّيت. رجعت حضرت بالنَّماء كمَّلت للآخر استفدت شوي مقارنةً بقبل، تعلَّمت أساسيَّات بالنِّسبة للـ UI فقط ومو كلشي. هيك لوقت شفت الإعلان عندك وكنت رح أمشي بس قلت بحضر الورشة مو خسرانة شي. حضرت وشفت شي مميَّز ومختلف عن المألوف، لهالسَّبب سجَّلت رغم ما عندي كتير وقت خفت ما تصحّلِّي هيك فرصة مرَّة تانية. حتَّى كنت بدي أبعت سجِّل فورًا بس وقَّفت شوي لرتِّب أموري. للأمانة وبكل صدق ما قصَّرت معنا أبدًا وعطيتنا كلشي بيلزمنا وأكتر بأسلوب كتير سلس، مُبسَّط وواضح. بالعكس نحنا يلِّي قصَّرنا وما التزمنا للأخير. كتير وكتير شغلات كنت سمعانة عنها وعاطين الها هالة كبيرة وهي ما الها لزوم. ما ممكن لاقي الشِّي يلِّي أخدناه بغير محل. شو ما حكيت قليل بكفِّي أنَّك مسحت الوهم يلِّي كان عنَّا، وأكيد أكيد مافي أستاذ بيفتح كورس لـ 3 طلاب بس. كتير ممنونة وكتير بتشكَّرك أستاذ، اللّٰه يعطيك ألف عافية يارب. لازم تكون رقم واحد بدل هالأسماء المسيوطة عالفاضي. كون متأكِّد أستاذ أنُّو كلّ الأفكار والرُّؤية والنَّصائح ترسَّخت عندي بشكل كبير، رح أمشي فيها عطول إن شاء اللّٰه. وهلَّق بعد ما تدرَّبنا عإيدك كيف بدنا نكمِّل مع غيرك بهالسُّوق. كتير مبسوطة بالمستوى يلِّي وصَّلتلُّو هلَّق بس رح أشتغل وطوِّر حالي أكتر حتَّى أقدر أرتقي لمستوى رؤية رقميَّة، هاد وعد منِّي.',
      image: '👩💻',
    },
    {
      name: 'ثراء',
      role: 'استشارة مهنية',
      content:
        'بالبداية شكرًا كثير الك. الاستشارة كانت جدًّا مفيدة، ضوّتلي على نقاط أساسيَّة وقدرت أعرف خطوتي الجاية كيف رح تكون. كورسات كاملة أخذتا ما عطتني الأساسات يلي حكيتلِّي عنَّا حضرتك بهالسَّاعة الوحدة. يعطيك ألف عافية.',
      image: '👩💼',
    },
    {
      name: 'صفا مَدَراتي',
      role: 'متدربة - دورة UI/UX',
      content:
        'ممتازة، استطعت من خلالها تعلُّم أساسيَّات هذا العلم. وركَّزت على الأهداف الأساسيَّة للحياة. وتوضيح الفكرة من هذه الدِّراسة والعمل. وأحسست بطاقة إيجابيَّة للمضي قدمًا في سبيل نشر دين اللّٰه ولو كانت الأمور صعبة. والابتعاد عن كل ما يشتِّت الإنسان من مواقع إلى أشخاص. جزاكم اللّٰه خيرًا، حديث مفيد في محلِّه.',
      image: '👩🎓',
    },
    {
      name: 'ريناد',
      role: 'متدربة - دورة UI/UX',
      content:
        'اللّٰه يجزيك الخير يارب. كنت بحاجة استشارة من حدا خبير و عرفان بالمجال من واقع سوق العمل مو كلام نظري منفصل عن الواقع وهاد الأمر عانيت منُّو بالجامعة لأنُّو المناهج منفصلة تمامًا عن سوق العمل والحمد للّٰه ربّ العالمين يسَّرلي الكلام معك و كانت الاستشارة كافية ووافية وتناولت نقاط كثيرة ومهمّة وبتدل على خبرة وملامسة مباشرة لسوق العمل. إن شاء اللّٰه رح كون جزء من الطلاب المتدرِّبين عند حضرتك وآخد الخبرة اللي عندك وإن شاء اللّٰه بتكون انطلاقة موفَّقة. اللّٰه يجزيك الخير و شكرًا على وقتك وجهدك.\\n\\nكمِّيّة امتناني للأستاذ والمعلومات الي أعطاني ياها بالكورس كبيرة جدًّا واللّٰه اللّٰه يجزيه الخير ويقوِّيه واللّٰه. كورس بياخد 10/10 وأكثر ما ندمت أبدًا أنُّو سجَّلت، وبالعكس كتير بحمد ربّ العالمين اللي دلني عالأستاذ اختصر علي كتيير مسافات. حابّة وجِّه شكر للأستاذ على كلشي قدَّملنا ياه بالكورس، من أكتر الكورسات الي استفدت منها على الإطلاق و ما ندمت أبدًا بالوقت ولا الجهد اللي بذلتو فيه رغم أنُّو أعتبر مقصرة. اللّٰه يجزيك الخير يا أستاذ على المعلومات والخلاصات اللي عطيتنا ياها، قصَّرت علينا كتير مسافات واختصرت علينا كتير مراجع تجاريّة بالمعلومات المهمّة اللي أخدناها، وإن شاء اللّٰه منطلع نخبة متل ما سمِّيتنا ويكون الكورس انطلاقة قويّة لإلنا. أنا شخصيًّا الكورس هاد كان أوَّل تجربة إلي بالمجال على الإطلاق ما أخدت شي قبلو. فكرة أنُّو بس بكورس واحد أعمل مشروع تطبيق كامل كان شي فوق توقُّعاتي، فهاد دليل على أنُّو الكورس شامل وقوي ومختصر و جامع خلاصة خبرة سنين. بشكر الأستاذ جدًّا على الاستشارة اللي قدَّملي ياها واللي خلتني أدخل الكورس بحماس، وبشكرو على كلّ الجهود اللي بذلها من إعطاء ومتابعة وتصحيح وظائف وتقييم نهائي. والملاحظات كتبتها كلها ورح اشتغل عليها الفترة الجاي وأخلِّي المشروع أقوى وياخد تقييم أعلى بإذن اللّٰه. مبسوطة جدًّا بتعرُّفي عليكم جميعًا والحمد للّٰه ربّ العالمين دلني على أصح طريق بالمجال من أوَّل خطوة والجاي أقوى بإذن اللّٰه.',
      image: '👩💻',
    },
    {
      name: 'حسام',
      role: 'استشارة مهنية',
      content:
        'أشكركَ جزيلًا أستاذ أيهم على تخصيص وقتك وعلى اللقاء القيِّم. كان لقاءً ثريًّا بالنِّقاشات والأفكار، وأقدِّر كثيرًا توجيهاتك وملاحظاتك البنَّاءة أستاذ أيهم.',
      image: '👨💼',
    },
    {
      name: 'عاصم الصَّالح',
      role: 'استشارة مهنية',
      content:
        'أستاذ أيهم شكرًا كتير كتير على الاستشارة الرَّائعة والمفيدة وعلى وقتك واستماعك الي وعلى نصائحك القويّة. شكرًا كتير.',
      image: '👨💻',
    },
    {
      name: 'أمينَة',
      role: 'استشارة مهنية',
      content:
        'يعطيك ألف عافية أستاذ. شكرًا كتير الك ولوقتك. واللّٰه ما بتتصوَّر قدِّيش استفدت من الاستشارة ووضحت عندي أمور عن مستواي وأخطائي. بتمنَّى بكل فترة أقدر آخد استشارة عند حضرتك وأقدر حدِّد مدى تطوُّري وهل ماشية بالطَّريق الصَّح وعم أشتغل منيح عحالي.\\n\\nواللّٰه جدًّا مفيدة كتير استفدت منها وطبَّقت الملاحظات اللي عطاني ياهم الأستاذ أيهم وفرق معي الشَّكل.',
      image: '👩🎓',
    },
    {
      name: 'مَلَك',
      role: 'استشارة مهنية',
      content:
        'شكرًا بشمهندس. استشارة مليئة بمعلومات ثمينة وواضحة. بعتذر عن سوء الإنترنت. شكرًا كتير الكم.',
      image: '👩💼',
    },
    {
      name: 'شيماء علي',
      role: 'استشارة مهنية',
      content:
        'شكرًا لحضرتك جدًّا. الاستشارة كانت بالنِّسبالي ممتازة ومفيدة. بجد جزاكم اللّٰه خيرًا وشكرًا لوقتكم. استفدت بصراحة منها. ربنا يبارك فيكم ويحفظكم يا رب.',
      image: '👩💻',
    },
    {
      name: 'بشرى الحسن',
      role: 'استشارة مهنية',
      content:
        'صراحةً الاستشارة كانت كتير كويسة وساعدتني أفهم المجال عسّوا ويصير عندي شغف لهالمجال أكتر. يعطيك العافية أستاذ ماقصَّرت.',
      image: '👩🎓',
    },
    {
      name: 'قاسم أرنودي',
      role: 'استشارة مهنية',
      content:
        'الشُّكر موصول للأستاذ محمَّد السَّيِّد والأستاذ أيهم العلي على الاستشارة المجَّانيّة. بكل أمانة لم أتوقَّع وجود فائدة كهذه، الأستاذ قام بتبسيط مفاهيم تجربة الإنسان مع المنتج أو الخدمة المقدَّمَة له، كما أعانني على رسم خارطة طريق تعلُّميَّة مثاليَّة وسأسعى لتتبُّعها في القريب العاجل بإذن اللّٰه. أنصح كل مَن ابتدئ أو احترف هذا المجال بالأخذ بهذه الفرصة وأسأل اللّٰه أن يجعلها في ميزان حسنات القائمين عليها. أحسن اللّٰه إليكم أستاذ أيهم وأستاذ محمَّد. الفائدة كانت كبيرة جدًّا. اللّٰه يعطيك ألف عافية يا رب و يجزيك الخير يا رب.',
      image: '👨💼',
    },
    {
      name: 'حسناء قدُّور',
      role: 'استشارة مهنية',
      content:
        'كل الشُّكر والتَّقدير للأستاذ أيهم العلي والأستاذ محمَّد السَّيِّد. الجلسة الاستشاريَّة كانت مفيدة جدًّا بالنِّسبة لي ومليئة بالمعرفة العمليَّة والتَّوجيهات الدَّقيقة، حيثُ استطاع المدرِّب بخبرته الواسعة أن يلاحظ أدقَّ التَّفاصيل في المشاريع ووجَّهني بحكمة ورؤية واضحة وصريحة. الأسلوب أيضًا كان مليئًا بالأمثلة الواقعيَّة التي ساعدتني على فهم النِّقاط بعمق وملاحظاته البنَّاءة ساهمت بشكل كبير في تطوير رؤيتي للتَّصميم وتجربة المستخدم ورؤية التَّصميم من منظور خبير ومنظور مستخدم بنفس الوقت. أشكركم جزيل الشُّكر على وقتكم واهتمامكم وعلى الاحترافيَّة العالية، وفعلًا مثل هذه الجلسات ضروريَّة لكل مبتدئ وحتَّى محترف في المجال لتحسين المهارات بشكل أكبر. جزاكم اللّٰه خيرًا.',
      image: '👩💼',
    },
    {
      name: 'رنيم الأحمد',
      role: 'استشارة مهنية',
      content:
        'تم فيها التَّنويه على نقاط مهمّة. تُشكَر جهود الأستاذ أيهم وجهودك، اللّٰه يجزيكم الخير يا رب.',
      image: '👩💻',
    },
    {
      name: 'عمران المطر',
      role: 'استشارة مهنية',
      content: 'الصّراحة الاستشارة كتير كانت مفيدة وممتعة. يعني أنا أعطيها تقييم 100٪.',
      image: '👨💻',
    },
    {
      name: 'قمر الجباصيني',
      role: 'استشارة مهنية',
      content:
        'جزاكم اللّٰه خيرًا على هذه الاستشارة القيِّمة. واللّٰه استفدت كتير من خبرتكم. تقييم الاستشارة فوق الميّة، واللّٰه يعني أفدّتوني بأشياء كتير كانت مو خاطرة على بالي. فعلًا استفدت منها بشكل كبير، كان فيها الإجابة على كل تساؤلاتي كالاعتناء وتنظيم معرض الأعمال والطُّرق الصَّحيحة بالتَّعامل مع العملاء وترتيب العمل وتسليمه بالشَّكل الصَّحيح وكتير مواضيع أخرى أفدتُّوني فيها. كانت الاستشارة كمحاضرة مختصرة غنيّة بالإفادة أجابت على كل أسئلتي. شكرًا لكم واللّٰه يجزيكم الخير.',
      image: '👩🎓',
    },
    {
      name: 'نورمان أسعد',
      role: 'استشارة مهنية',
      content:
        'كانت الاستشارة جدًّاااا مفيدة الي. لو الوقت كان قليل بس كتير استفدت ووعّتني عشغلات ما كنت اصلًا منتبهة عليها يعني عطاني طرف خيط وشرحلي بدقَّة عن السُّوق والعميل بطريقة غير مأهولة وعطاني أفكار بلِّش فيها. كتير شكرًا الكن، والأستاذ شرحو رااائع. موفَّقين كتير عنجددد.',
      image: '👩💼',
    },
    {
      name: 'أحمَد أبو حسَن',
      role: 'استشارة مهنية',
      content:
        'الاستشارة جدًّا حلوة وعنجد تفتَّحت عيوني على كتير شغلات وكانت كتير ممتعة وأستاذ أيهم عميعطي بضمير وعميوجِّه الإنسان لطريق صح. للأمانة التَّقييم 100٪ لأنُّو فعلًا بتستاهلوا كل خير واللّٰه يجزيكون الخير على كلشي عمتعملوه. ياريت الكل متل أستاذ أيهم.',
      image: '👨💼',
    },
    {
      name: 'هيا رزُّوق',
      role: 'استشارة مهنية',
      content:
        'ما شاء اللّٰه عنُّو أستاذ أيهم، واضح، حدا ضليع بالمجال وعرفان كل كلمة شو يحكيّا ووين يحطّا. أكيد استفدت كتير كتير وكانت نصائح بمحلّا.',
      image: '👩💻',
    },
    {
      name: 'نصرات الحلاق',
      role: 'متدرب ومستفيد من استشارة',
      content:
        'للأمانة الاستشارة كانت مفيدة جدًّا وخاصَّةً لشخص متلي ما كنت قادرة أوصل لتقييم ونقد واضح وشفَّاف (النَّاس بتحب تكون لطيفة فما بتعطي تقييم حقيقي بأغلب الأوقات). الأستاذ حكا المشاكل بشكل واضح. لخَّص خطوات وآليّة الشّغل بشكل كتير سلس وواضح ومفهوم. حدَّد شو المهم بالتَّعلُّم بشكل مفيد، مو حكي كورسات. فهمت أكتر عن سوق العمل بالوقت الحالي من خبرة الأستاذ. حدَّدت خطوات أوَّليّة لأمشي بالطَّريق الصَّح وكان الموضوع جدًّا مفيد. ولذلك حابّة قول شكرًا جزيلًا لوقتكم وجهدكم. ماقصَّرتوا، اللّٰه يجزيكم الخير.\\n\\nالكورس كان مفيد جدًّا وكتير من المعلومات الموجودة فيه ما كنت بعرفها لا من الكورسات ولا من الشّغل وماحدا بيعلّمنا ياها حتَّى ضمن العمل. إن شاء اللّٰه رح نشتغل على حالنا أكتر ومارح يروح التَّعب بدون نتيجة. بالنِّسبة الي هاد كان أفضل كورس حضرتو بهالمجال صراحةً، جدًّا مفيد وعملي وغني بمعلومات ما وصلتلها من ولا مكان. اللّٰه يعطيك العافية أستاذ أيهم ما قصَّرت واللّٰه. أنا عن نفسي جدًّا استفدت الحمد للّٰه وكنت متمنية لو كان أطول حتَّى. نقد سلبي غير أنُّو الأستاذ بيتنمَّر علينا ما بتوقَّع موجود 😂😂😂.',
      image: '👨💻',
    },
    {
      name: 'أديبة الدَّهب',
      role: 'استشارة مهنية',
      content:
        'كانت استشارة كتير ممتعة وتقريبًا غيَّرتلي كتير من أفكار كنت معتمدة عليها، بالإضافة لمفاهيم جديدة اكتسبتها ما كنت بعرفها من الكورس يلِّي تابعت فيه. مشكورين كتير.',
      image: '👩🎓',
    },
    {
      name: 'إيمان الرَّقب',
      role: 'استشارة مهنية',
      content:
        'شكرًا لكم أنتم، شكرًا من قلبي. الاستشارة كانت مُثمرة وأحببت فرادة المقدِّمة والاعتزاز بالهويَّة العربيَّة الإسلاميَّة، ولفتني الاعتزاز بالإنسان كإنسان لا مستخدم مجرَّد رقم. صدقًا تمنِّيت لو أنَّها امتدَّت أكثر، لكن الوقت تأخَّر وانقطاع الإنترنت قيَّد ذلك. شكرًا لأبعد حد.',
      image: '👩💼',
    },
    {
      name: 'مُحمَّد غِياث النَّاصر',
      role: 'متدرب - دورة UI/UX',
      content:
        'الكورس كان مميَّز بحق، والنَّتيجة المرجوّة تحقَّقت والقادم مليء بالإنجازات. نشكر كلّ المعلومات المقدَّمة وكل شيء. هي خطوة أولى نحو نجاحات كثيرة قادمة بإذن اللّٰه تعالى.',
      image: '👨💼',
    },
    {
      name: 'جود كردي',
      role: 'متدربة - دورة UI/UX',
      content:
        'بجددد الكورس من أفضل الكورسات اللي مرّت علي بالأمانة والعطاء والدِّين. علَّمتنا نشتغل كدنيا وممكن نستفيد منها لآخرتنا، هاد الشِّي كتير لفتني وحبِّيتو.',
      image: '👩💻',
    },
    {
      name: 'شهد كروم',
      role: 'متدربة - دورة UI/UX',
      content:
        'السلام عليكم ورحمة الله وبركاته\\nفي البداية أشكر المدرب على عمله المتفاني وتعبه معنا وصبره علينا وجهده فعلا ماقصرت جزاكم الله خير الجزاء وكتب عملكم هذا في أحسن أعمالكم..برأيي الكورس كان ممتاز جدا وإذا كنت بقدر قيّمه بخمس نجوم فأعطيه خمس نجوم..كشخص مبتدئ جدا من الصفر أو ما تحت الصفر لأنه أنا حتى اسم المجال ماكنت أعرف معناه ولا عندي خبرة في التصميم سابقا وما بعرف من التصميم إلا اسمه.. معلومات الكورس كانت ضخمة جدا وبنفس الوقت كافية لتعطيني الثقة لأبدأ بمشروع خاص وهذا المطلوب..تمنيت لو أني أعطيت للكورس حقه والمزيد من الوقت لكن الحمدلله على كل حال..مع ذلك لم أستسلم وأحببت هذا المجال بفضلكم أصبحت أقدر أصغر تصميم أراه فقد غيرتم رؤيتي ومفهومي للمجال وسأسعى إن شاء الله للعمل بالعلم الذي أعطيتمونيه حتى أنجز مشاريع حقيقية ..جزاكم الله خير الجزاء.',
      image: '👩🎓',
    },
    {
      name: 'هديَّةُ اللّٰه حمر',
      role: 'متدربة - دورة UI/UX',
      content:
        'شكرًا كتير لتعبكم ما قصَّرتوا أبدًا. الصَّراحة مع أنُّو أوَّل مرَّة باخد الكورس بس حبِّيت المجال وصرت ركِّز أكتر بالتَّصاميم للتَّطبيقات وتغيَّرت نظرتي كليًّا للأفضل وهاد كلُّو بفضلكم. الكورس كان بالنِّسبة الي مفيد جدًّا ممتلئ بالأفكار والملاحظات يلِّي مو ممكن تنوجد بكورسات تجاريّة. شكرًا لكلّ النَّصائح والتَّوجيهات يلِّي قدَّمتها أستاذ أيهم سواءً كانت بمجال الكورس أو بالحياة. اللّٰه يعطيكم العافية ويجزيكم كلّ الخير ويجعل تعبكم معنا بميزان حسناتكم.',
      image: '👩💼',
    },
  ];

  return (
    <section className="section-spacing" id="testimonials">
      <div className="max-w-7xl mx-auto container-padding">
        <ScrollAnimation animation="slide-down" duration={0.7}>
          <div className="text-center max-w-3xl mx-auto section-header">
            <h2 className="text-3xl sm:text-4xl lg:text-5xl mb-4 font-bold" style={{ fontFamily: "'IBM Plex Sans Arabic', sans-serif" }}>
              ماذا <span className="gradient-text">قالوا عنَّا</span>؟
            </h2>
            <p className="text-sm sm:text-base lg:text-lg text-foreground/70"></p>
          </div>
        </ScrollAnimation>
      </div>

      {/* Testimonials Horizontal Scroll - Full Width with Edge Navigation */}
      <div className="relative w-full group/scroll">
        {/* Left Navigation Arrow - Desktop (scroll to see more) */}
        {canScrollLeft && (
          <button
            onClick={() => scroll('left')}
            className="hidden md:flex absolute left-4 top-1/2 -translate-y-1/2 z-20 w-12 h-12 rounded-full items-center justify-center border cursor-pointer transition-all duration-300 hover:scale-110"
            style={{
              backgroundColor: 'rgba(0, 0, 0, 0.6)',
              borderColor: 'rgba(255, 255, 255, 0.15)',
              backdropFilter: 'blur(8px)',
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.backgroundColor = '#7766EE';
              e.currentTarget.style.borderColor = '#7766EE';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.backgroundColor = 'rgba(0, 0, 0, 0.6)';
              e.currentTarget.style.borderColor = 'rgba(255, 255, 255, 0.15)';
            }}
            aria-label="التالي"
            type="button"
          >
            <CaretLeft className="w-6 h-6 text-white" />
          </button>
        )}

        {/* Right Navigation Arrow - Desktop (scroll back) */}
        {canScrollRight && (
          <button
            onClick={() => scroll('right')}
            className="hidden md:flex absolute right-4 top-1/2 -translate-y-1/2 z-20 w-12 h-12 rounded-full items-center justify-center border cursor-pointer transition-all duration-300 hover:scale-110"
            style={{
              backgroundColor: 'rgba(0, 0, 0, 0.6)',
              borderColor: 'rgba(255, 255, 255, 0.15)',
              backdropFilter: 'blur(8px)',
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.backgroundColor = '#7766EE';
              e.currentTarget.style.borderColor = '#7766EE';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.backgroundColor = 'rgba(0, 0, 0, 0.6)';
              e.currentTarget.style.borderColor = 'rgba(255, 255, 255, 0.15)';
            }}
            aria-label="السابق"
            type="button"
          >
            <CaretRight className="w-6 h-6 text-white" />
          </button>
        )}

        {/* Edge Fade Gradients - Desktop (only show when there's content in that direction) */}
        {canScrollLeft && (
          <div
            className="hidden md:block absolute left-0 top-0 bottom-0 w-20 z-10 pointer-events-none"
            style={{ background: 'linear-gradient(to right, rgba(2, 6, 23, 0.9), transparent)' }}
          />
        )}
        {canScrollRight && (
          <div
            className="hidden md:block absolute right-0 top-0 bottom-0 w-20 z-10 pointer-events-none"
            style={{ background: 'linear-gradient(to left, rgba(2, 6, 23, 0.9), transparent)' }}
          />
        )}

        <div
          ref={scrollRef}
          className="horizontal-scroll pt-2 md:pt-4 pb-12 flex"
          style={{
            paddingLeft: 'max(24px, calc((100vw - 1280px) / 2 + 80px))',
            paddingRight: 'max(24px, calc((100vw - 1280px) / 2 + 80px))',
            scrollPaddingInline: '80px',
            gap: '16px',
          }}
          role="region"
          aria-label="آراء العملاء"
        >
          {testimonials.map((testimonial, index) => (
            <div
              key={index}
              tabIndex={0}
              className="scroll-snap-item testimonial-card group relative glass-card rounded-2xl card-padding glass-hover transition-all duration-300 flex-shrink-0 focus:outline-none focus:ring-2 focus:ring-[#7766EE] focus:ring-offset-2 focus:ring-offset-[#020617] flex flex-col"
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  setSelectedReview(index);
                }
              }}
            >
              {/* Content */}
              <div
                className="content-spacing relative z-10 cursor-pointer"
                onClick={() => setSelectedReview(index)}
              >
                <p className="text-foreground/80 leading-relaxed line-clamp-3 whitespace-normal break-words group-hover:text-foreground transition-colors duration-300">
                  "{testimonial.content}"
                </p>
                {/* Read More - Hidden on desktop, visible on hover; Always visible on mobile */}
                <div className="flex items-center gap-1 text-[#7766EE] text-sm mt-2 font-medium md:opacity-0 md:group-hover:opacity-100 transition-all duration-300">
                  <span>قراءة المزيد</span>
                  <CaretLeft className="w-4 h-4" />
                </div>
              </div>

              {/* Author */}
              <div className="flex items-center element-gap-sm relative z-10 mt-auto">
                <div
                  className="w-12 h-12 md:w-14 md:h-14 rounded-full flex items-center justify-center flex-shrink-0 shadow-lg overflow-hidden border-none ring-0 outline-none"
                  style={{
                    background: 'linear-gradient(135deg, #7766EE 0%, #A78BFA 100%)',
                  }}
                >
                  <UserCircle className="w-6 h-6 md:w-7 md:h-7 text-white" />
                </div>
                <div className="font-semibold text-foreground">{testimonial.name}</div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Bottom Sheet */}
      {selectedReview !== null && (
        <>
          {/* Overlay */}
          <div
            style={{
              position: 'fixed',
              top: 0,
              left: 0,
              right: 0,
              bottom: 0,
              backgroundColor: 'rgba(0, 0, 0, 0.6)',
              backdropFilter: 'blur(8px)',
              zIndex: 9998,
            }}
            onClick={closeReviewSheet}
          />

          {/* Bottom Sheet */}
          <div
            className="review-bottom-sheet"
            style={{
              position: 'fixed',
              bottom: '24px',
              left: '50%',
              transform: 'translateX(-50%)',
              width: 'calc(100% - 48px)',
              maxWidth: '327px',
              maxHeight: 'calc(100vh - 100px)',
              background: 'linear-gradient(135deg, #020617 0%, #3b0764 50%, #0f172a 100%)',
              borderRadius: '24px',
              boxShadow: '0 20px 60px rgba(0, 0, 0, 0.5)',
              zIndex: 9999,
              overflow: 'hidden',
              display: 'flex',
              flexDirection: 'column',
              animation: 'slideUpFromBottom 0.4s cubic-bezier(0.16, 1, 0.3, 1) forwards',
            }}
          >
            {/* Header */}
            <div
              style={{
                padding: '12px 16px',
                borderBottom: '1px solid rgba(255, 255, 255, 0.1)',
                position: 'relative',
                flexShrink: 0,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'flex-start',
                direction: 'ltr',
              }}
            >
              {/* Drag handle */}
              <div
                style={{
                  position: 'absolute',
                  top: '8px',
                  left: '50%',
                  transform: 'translateX(-50%)',
                  width: '48px',
                  height: '4px',
                  backgroundColor: 'rgba(255, 255, 255, 0.2)',
                  borderRadius: '2px',
                }}
                className="md:hidden"
              />

              {/* Close button */}
              <button
                onClick={closeReviewSheet}
                style={{
                  position: 'relative',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  padding: 0,
                  background: 'transparent',
                  border: 'none',
                  cursor: 'pointer',
                  color: 'rgba(255, 255, 255, 0.8)',
                  transition: 'color 0.2s',
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.color = 'white';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.color = 'rgba(255, 255, 255, 0.8)';
                }}
                type="button"
                aria-label="إغلاق"
              >
                <X className="w-6 h-6" />
              </button>
            </div>

            {/* Content */}
            <div
              className="custom-review-scrollbar"
              style={{
                padding: '24px',
                overflowY: 'auto',
                flex: 1,
                color: 'rgba(255, 255, 255, 0.9)',
              }}
            >
              <p
                style={{
                  fontSize: '16px',
                  lineHeight: '1.6',
                  marginBottom: '24px',
                  whiteSpace: 'pre-wrap',
                }}
              >
                "{testimonials[selectedReview].content}"
              </p>

              {/* Author */}
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '16px',
                  paddingTop: '16px',
                  borderTop: '1px solid rgba(255, 255, 255, 0.1)',
                }}
              >
                <div
                  style={{
                    width: '56px',
                    height: '56px',
                    borderRadius: '50%',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    flexShrink: 0,
                    background: 'linear-gradient(135deg, #7766EE 0%, #A78BFA 100%)',
                    boxShadow: '0 4px 12px rgba(0, 0, 0, 0.3)',
                  }}
                >
                  <UserCircle className="w-7 h-7 text-white" />
                </div>
                <h4
                  style={{
                    fontWeight: 'bold',
                    color: 'white',
                  }}
                >
                  {testimonials[selectedReview].name}
                </h4>
              </div>
            </div>
          </div>

          {/* Custom Scrollbar & Desktop Styles */}
          <style>{`
            /* Slide up animation for mobile */
            @keyframes slideUpFromBottom {
              from {
                transform: translateX(-50%) translateY(100%);
                opacity: 0;
              }
              to {
                transform: translateX(-50%) translateY(0);
                opacity: 1;
              }
            }

            /* Custom Scrollbar */
            .custom-review-scrollbar::-webkit-scrollbar {
              width: 8px;
            }
            
            .custom-review-scrollbar::-webkit-scrollbar-track {
              background: rgba(255, 255, 255, 0.05);
              border-radius: 4px;
            }
            
            .custom-review-scrollbar::-webkit-scrollbar-thumb {
              background: linear-gradient(135deg, #7766EE 0%, #A78BFA 100%);
              border-radius: 4px;
              transition: background 0.2s;
            }
            
            .custom-review-scrollbar::-webkit-scrollbar-thumb:hover {
              background: linear-gradient(135deg, #8B5CF6 0%, #C4B5FD 100%);
            }
            
            /* Firefox scrollbar */
            .custom-review-scrollbar {
              scrollbar-width: thin;
              scrollbar-color: #7766EE rgba(255, 255, 255, 0.05);
            }
            
            /* Desktop responsive */
            @media (min-width: 768px) {
              .review-bottom-sheet {
                top: 50% !important;
                bottom: auto !important;
                transform: translate(-50%, -50%) !important;
                max-width: 600px !important;
                max-height: 80vh !important;
                animation: fadeIn 0.3s ease-out forwards !important;
              }

              @keyframes fadeIn {
                from {
                  opacity: 0;
                  transform: translate(-50%, -50%) scale(0.95);
                }
                to {
                  opacity: 1;
                  transform: translate(-50%, -50%) scale(1);
                }
              }
            }


          `}</style>
        </>
      )}
      <style>{`
        .testimonial-card {
          width: 288px;
          min-width: 288px;
          max-width: 288px;
        }
        
        @media (min-width: 768px) {
          .testimonial-card {
            width: 400px;
            min-width: 400px;
            max-width: 400px;
          }
        }
      `}</style>
    </section>
  );
}
