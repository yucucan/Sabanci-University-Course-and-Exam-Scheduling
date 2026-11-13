/* Only codes, titles and ECTS come from the supplied catalogue.
   People, rooms, capacities, course structures and assignments below are illustrative. */
'use strict';
{
  const faculty='Faculty of Engineering and Natural Sciences (FENS)';
  const subjects=[...new Set(window.SABANCI_CATALOG.map(c=>c.department))];
  const subjectNames={BIO:'Biological Sciences and Bioengineering',CHEM:'Chemistry',CS:'Computer Science',DSA:'Data Science and Analytics',EE:'Electronics Engineering',ENRG:'Energy',ENS:'Engineering and Natural Sciences',IE:'Industrial Engineering',IF:'IF course group',MAT:'Materials Science',MATH:'Mathematics',ME:'Mechatronics and Manufacturing',NS:'Natural Sciences',PHYS:'Physics',PROJ:'Project Courses'};
  const campus='Sabancı University';
  const buildings=['FENS · example teaching building','Shared teaching spaces · example'];
  const instructors=[['Deniz','Demo','CS','Instructor'],['Ece','Demo','IE','Instructor'],['Arda','Demo','MATH','Instructor'],['Selin','Demo','EE','Instructor'],['Mert','Demo','PHYS','Instructor'],['Ada','Demo','BIO','Instructor'],['Can','Demo','CS','Teaching Assistant'],['Ela','Demo','IE','Teaching Assistant'],['Eren','Demo','MATH','Learning Assistant'],['İpek','Demo','CS','Learning Assistant']].map(([name,surname,department,role],i)=>({name,surname,department,role,email:`demo.staff.${i+1}@example.com`,faculty,min:0,max:8}));
  const classrooms=[['DEMO-101','Example lecture hall',137,'Lecture Hall',0],['DEMO-102','Example classroom',53,'Classroom',0],['DEMO-103','Example classroom',81,'Classroom',0],['DEMO-PC1','Example computer room',37,'Computer Laboratory',0],['DEMO-LAB1','Example science lab',29,'Science Lab',0],['DEMO-201','Example shared hall',243,'Lecture Hall',1],['DEMO-202','Example seminar room',21,'Seminar Room',1],['DEMO-203','Example classroom',67,'Classroom',1]].map(([code,name,capacity,type,b])=>({code,name,capacity,type,campus,building:buildings[b],gap:10}));
  const courses=window.SABANCI_CATALOG.map((c,idx)=>{
    const isIntro=/100|101|201|202|210|211/.test(c.code);
    const defaultCap=isIntro?120:60;
    const defaultSecs=isIntro?2:1;
    const reqLab=/CS|BIO|CHEM|PHYS|EE|ME/.test(c.department);
    return {
      code:c.code,
      name:c.name,
      department:c.department,
      catalogEcts:c.catalogEcts,
      credits:Math.max(2,Math.min(4,Math.round(c.catalogEcts/2))),
      openStatus:idx<16?'Open':'Planned',
      doubleCodedCourse:c.code==='DSA210'?'CS210':c.code==='ENS208'?'IE208':c.code==='BIO310'?'CS310':'',
      specialApproval:c.code==='PROJ201'?'Required':'Not required',
      weeklyHours:reqLab?4:3,
      patterns:reqLab?'2+2, 3+1':'3+0, 2+1',
      capacity:defaultCap,
      plannedSections:defaultSecs,
      sectionCapacity:Math.round(defaultCap/defaultSecs),
      partOfTerm:'Full Term (14 Weeks)',
      notes:c.catalogVariants?`The supplied catalogue lists multiple entries for this code: ${c.catalogVariants.map(v=>v.name+' ('+v.catalogEcts+' ECTS)').join('; ')}. Confirm the term-specific version.`:(isIntro?'University-wide foundational academic block; coordinate cross-faculty sections.':'Standard faculty offering.'),
      corequisites:reqLab?`${c.code}.L`:'',
      instructorRequest:instructors[idx%6].name+' '+instructors[idx%6].surname,
      classRequirements:reqLab&&c.department==='CS'?'Computer Laboratory':reqLab&&/BIO|CHEM|PHYS/.test(c.department)?'Science Lab':defaultCap>=100?'Lecture Hall':'Classroom',
      correctionStatus:idx<12?'Reviewed':idx<20?'Pending review':'Not specified',
      roomRequest:defaultCap>=100?'DEMO-101':'DEMO-102',
      sections:[],
      labs:[],
      distributions:[{term:isIntro?1:2,department:c.department,percentage:isIntro?75:100},...(isIntro?[{term:1,department:c.department==='CS'?'DSA':'CS',percentage:25}]:[])]
    };
  });
  const examples=[
    ['CS201','MONDAY','08:40','10:30','DEMO-101',0,112,'2+2, 3+1','Lecture Hall'],
    ['CS202','MONDAY','12:40','14:30','DEMO-103',0,72,'2+2','Classroom'],
    ['IE311','TUESDAY','10:40','12:30','DEMO-102',1,47,'3+0, 2+1','Classroom'],
    ['IE305','THURSDAY','08:40','10:30','DEMO-103',1,62,'3+0, 2+1','Classroom'],
    ['MATH101','WEDNESDAY','08:40','10:30','DEMO-201',2,218,'2+2, 4+0','Lecture Hall'],
    ['MATH201','FRIDAY','10:40','12:30','DEMO-101',2,101,'3+0, 2+1','Lecture Hall'],
    ['EE200','TUESDAY','13:40','15:30','DEMO-101',3,108,'2+2, 3+1','Lecture Hall'],
    ['PHYS211','THURSDAY','14:40','16:30','DEMO-102',4,48,'2+2, 3+1','Classroom'],
    ['BIO301','WEDNESDAY','13:40','15:30','DEMO-102',5,46,'2+2, 3+1','Classroom'],
    ['DSA210','FRIDAY','08:40','10:30','DEMO-103',0,69,'2+1, 3+0','Classroom'],
    ['ENS208','MONDAY','15:40','17:30','DEMO-102',1,41,'2+1, 3+0','Classroom'],
    ['IF100','TUESDAY','16:40','19:30','DEMO-103',0,76,'3+0, 2+1','Classroom']
  ];
  examples.forEach(([code,day,start,end,classroom,person,demand,patterns,reqType])=>{
    const c=courses.find(c=>c.code===code);if(!c)throw new Error('Catalogue example missing: '+code);
    c.patterns=patterns;c.weeklyHours=end==='19:30'?3:2;c.plannedSections=1;c.capacity=demand;c.sectionCapacity=demand;
    c.openStatus='Open';c.correctionStatus='Reviewed';
    c.instructorRequest=instructors[person].name+' '+instructors[person].surname;
    c.roomRequest=classroom;c.classRequirements=reqType;
    c.sections.push({name:code+'.A',day,start,end,classroom,instructor:instructors[person].name+' '+instructors[person].surname,demand,teachingAssistant:code==='CS201'?instructors[6].email:code==='IE311'?instructors[7].email:'',learningAssistant:code==='MATH101'?instructors[8].email:''});
    c.distributions=[{term:/100|101|201|208|210/.test(code)?1:2,department:c.department,percentage:100}];
  });
  const cs=courses.find(c=>c.code==='CS202');
  cs.patterns='2+2, 3+1';cs.weeklyHours=4;
  cs.labs.push({name:'CS202.L-A',instructor:'Deniz Demo',classroom:'DEMO-PC1',demand:31,scheduleType:'Weekly',pattern:'2',day:'FRIDAY',start:'16:40',end:'18:30',teachingAssistant:instructors[6].email,learningAssistant:instructors[9].email});
  const timeStructure=[];
  ['Monday','Tuesday','Wednesday','Thursday','Friday','Saturday','Sunday'].forEach(day=>{
    for(let hour=8;hour<=18;hour++)timeStructure.push({day,start:`${String(hour).padStart(2,'0')}:40`,end:`${String(hour+1).padStart(2,'0')}:30`});
  });
  window.EXAMPLE_DATA={campuses:[{name:campus}],buildings:buildings.map(name=>({name,campus})),faculties:[{name:faculty}],departments:subjects.map(abbreviation=>({name:subjectNames[abbreviation]||abbreviation,abbreviation,faculty})),buildingScores:subjects.flatMap(department=>buildings.map((building,i)=>({department,building,score:i?60:85}))),classroomTypes:[...new Set(classrooms.map(r=>r.type))].map(name=>({name})),courseTypes:[{name:'Lecture'},{name:'Laboratory'},{name:'Recitation'}],timeStructure,campusTravel:[],buildingTravel:[{from:buildings[0],to:buildings[1],minutes:15},{from:buildings[1],to:buildings[0],minutes:15}],campusBuildingTravel:[],instructors,classrooms,courses,standardRules:[{name:'First-year core academic block (CS201 & MATH101)',type:'Different Time',elements:'CS201, MATH101',enforcement:'Hard',importance:100},{name:'IE junior core separation (IE311 & IE305)',type:'Different Time',elements:'IE311, IE305',enforcement:'Hard',importance:90}],orderRules:[{name:'CS202 lecture before laboratory',before:'CS202.A',after:'CS202.L-A',enforcement:'Hard',importance:100}]};
}
