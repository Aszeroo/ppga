-- ============================================================================
-- English bodies for chapters 1-3 lesson steps.
--
-- Source: /home/wasu/ppga-review/2026-11-20-drafts/lesson-en-source.json,
-- the production public.ppg_lesson_steps rows whose body_en was empty
-- (59 rows). Only the 32 rows with a non-empty Thai body are updated;
-- the 27 check steps keep an empty body_en (their shape check forbids prose).
-- This migration writes the body_en column only; no other column changes.
-- ============================================================================

update public.ppg_lesson_steps
  set body_en = '## What a presentation means

A presentation means taking the information and all the details that have been gathered and organising them neatly, in order to present that information from the presenter to the audience so they understand the topic being presented, using various techniques and methods to achieve the goal set for the presentation.'
  where lesson_key = 'chapter-01-lesson-01' and order_index = 2;

update public.ppg_lesson_steps
  set body_en = '## The importance of presentations

A presentation counts as a necessary form of communication and is very important to work in every field and profession. You can see that at conferences and seminars run by government or private organisations, a presentation is created every time to make the session interesting.

The same applies in education, where presentations are used to create teaching materials for instructors, or as a medium for presenting students'' project work at various institutions. Today they are widely used, and the subject has also become part of the curriculum at many educational institutions.

For this reason, presentations are considered important to every kind of work and every profession, because they help make the preparation of information for a presentation more interesting and more effective.'
  where lesson_key = 'chapter-01-lesson-01' and order_index = 3;

update public.ppg_lesson_steps
  set body_en = '## The purposes of a presentation

The purpose or goal of a presentation is very important, as follows.

3.1 To let the audience know an opinion or a requirement, for example at committee meetings, where the chairperson explains the meeting agenda so that the meeting is informed.

3.2 To let the audience consider a particular matter, for example at each committee meeting, where the various sub-committees must explain information or present their opinions to the meeting so that it can deliberate, decide, or vote.

3.3 To give the audience knowledge from the information presented, for example in training or seminars, where the speaker or expert must present information consisting of knowledge and facts to the trainees, or use it to summarise the results of various operations so that visitors to the organisation, or supervisors who come to inspect, are informed.

3.4 To give the audience a correct understanding, for example when explaining rules or working methods to the people involved, especially when a new rule is issued or a working approach is changed; there is a need to explain so that everyone has the same understanding and can act correctly.'
  where lesson_key = 'chapter-01-lesson-01' and order_index = 4;

update public.ppg_lesson_steps
  set body_en = '## Types of presentations

Presenting work is necessary and accepted in any working system, because it helps work reach its goals and develop faster. How it is used depends on the nature of the work. Presentations are divided into two main types, as follows.

4.1 A targeted presentation presents information to people who are responsible for the matter or who have been invited to attend and listen to the presentation.

4.2 A public presentation presents information and opens the opportunity for members of the public to attend and listen. It also gives the audience the chance to ask questions or express opinions.'
  where lesson_key = 'chapter-01-lesson-02' and order_index = 2;

update public.ppg_lesson_steps
  set body_en = '## 5. The nature of the information presented

A presentation can bring together information of different kinds, depending on the presenter''s purpose. The information to be presented is divided by its nature into two types.

5.1 Facts are statements about events, stories of how something came about, or actual conditions. They may be knowledge obtained from scientific testing or experiments, and can be used as evidence or a reference for proving something.

5.2 Opinions are views that arise from an issue or a story that prompts thinking. They may be feelings, beliefs, or ideas that the presenter holds about something. Opinions may differ, depending on each person''s background and experience.'
  where lesson_key = 'chapter-01-lesson-02' and order_index = 3;

update public.ppg_lesson_steps
  set body_en = '## 6. Programs used for presentations

There are many programs to choose from for presenting work. There are two channels for delivering a presentation: offline, which generally uses PowerPoint or a courseware program (CAI stands for Computer Assisted Instruction), and online, which uses a website to present the work. Examples of presentation programs are as follows.

### 6.1 Microsoft PowerPoint

This is a presentation program with many users because it is the easiest to use and produces quality results. It can be connected to a projector to present in a meeting room or to a large number of people.

### 6.2 Adobe Animate

This is an animation program, one of the Adobe Creative Cloud suite. It was created to develop motion files or animation for websites, known as Web Animation, and can create interactive responses with visitors on various websites. It developed from Adobe Flash Professional into Adobe Animate, released for use with functions that work more conveniently.

### 6.3 Various online presentation programs

For example, the Google Slides presentation program, the Canva online teaching-material program, and the Prezi program, among others.'
  where lesson_key = 'chapter-01-lesson-02' and order_index = 4;

update public.ppg_lesson_steps
  set body_en = '## 7. Principles of presentation

Creating a good and interesting presentation follows the principles of the Zen style of presentation, a design approach that is simple and to the point, as follows.

### 7.1 Big means large text that can be read clearly even from a distance

### 7.2 Clear means concise wording that is clear and to the point

### 7.3 Clean means tidy, uncluttered, and easy on the eye

7.4 Simple means straightforward and uncomplicated, so that the reader can understand it easily

7.5 Story means telling an interesting story, using several storytelling techniques, and understanding both the objective of the presentation and the audience

7.6 Good Presentation Technique means having good presentation technique, with animation to help communicate with the audience. Many parts are soft skills — personal skills involving habits, personality, attitudes, and the ability to interact with others, which require artistry in presenting — and many parts are techniques that depend on learning and experience, which make a presentation more professional.'
  where lesson_key = 'chapter-01-lesson-02' and order_index = 5;

update public.ppg_lesson_steps
  set body_en = '## Principles for designing a presentation

Things to observe when laying out the structure

Each document or slide consists of a main heading, a sub-heading, and content.

(The content should be concise and to the point, with clear headings and the following details.)

1. The first slide shows only the main heading (the title) and the sub-heading (the presenter''s name)

2. A slide may contain text, pictures, animation, charts, diagrams, tables, sound, and video

### 3. Using illustrations

- The pictures used must support the message being presented
- There should be no text inside the picture
- Text should have a shadow to increase clarity
- Reduce anything that creates clutter
- The pictures used may make the file size too large

### 4. Designing the slide background

- Simple and easy on the eyes
- Emphasise the text itself
- Avoid glittering colours or patterns
- Do not use colours that are too dark or too bright

### 5. Colour and text

- The background carries light-coloured text
- The text shadow must be more effective than the background colour
- The text must be easy to read
- Use a True Type Font typeface
- Use 1 or 2 typefaces
- Size 36-60 Point + bold

### 6. About colour

- Use the same shade of colour consistently throughout the presentation
- Choose the background first, then choose colours that contrast with it

### 7. Headings 60 Point

- Content should be 36-50 Point
- It should be bold

### 8. Include clear multimedia'
  where lesson_key = 'chapter-01-lesson-03' and order_index = 2;

update public.ppg_lesson_steps
  set body_en = '## Things to avoid in design

(1) Do not use text that is too small, or too tiny

(2) A document or slide with no attractive colour, or with colours that are too garish

(3) Do not put in too many pictures, or use a picture as the background

(4) Showing a large table that contains very little information

(5) Too much animation'
  where lesson_key = 'chapter-01-lesson-03' and order_index = 3;

update public.ppg_lesson_steps
  set body_en = '## 8. Preparing before the presentation

A good presentation should be planned in steps, starting with drafting the outline of ideas and preparing the content details, which makes the work finish quickly and in line with the goal. The formats commonly used before a presentation are as follows.

Preparing a slide presentation

### 8.1 Laying out the structure

Study the audience to see what they are like. You must have a clear understanding of the information to be presented so that the result meets the goal. Each slide consists of a main heading, a sub-heading, and content.

### 8.2 Preparing the content details

Set the various headings, focusing mainly on the audience: what content or layout the slide should have, or how it should be presented, such as adding pictures, adding colour, and the approach to the presentation.

8.3 Adding text, pictures, and charts to slides: put the things you want to present onto each slide.

8.4 Polishing the slides to look attractive: adjust the text, the colours used on the slides, and the display format so they look beautiful and easy to follow.

8.5 Making the presentation more interesting: use slide transition techniques and text animation to add interest.

8.6 Preparing for the actual presentation: rehearse speaking along with the slides, timing yourself so you know whether the delivery takes an appropriate amount of time.

8.7 Printing the handout documents: print the lecture notes and prepare handouts for the audience, so that the audience does not waste time taking notes and can spend that time listening to what is being presented instead.'
  where lesson_key = 'chapter-01-lesson-03' and order_index = 4;

update public.ppg_lesson_steps
  set body_en = '## An example of a presentation for

Each slide under the topic Seminar, so you can picture a correct and clear presentation.

Slide	Details

1	Shows only the title and sub-heading, the presenter''s name

2	Shows the purpose of the presentation

3	Shows the topics to be covered

4	Shows topic 1

5	Shows topic 2

6	Shows topic 3

7	Continues from topic 3

8	Shows topic 4

9	Shows topic 5

10	Continues from topic 5

11	Shows a summary of the key content

12	Question & Answer'
  where lesson_key = 'chapter-01-lesson-03' and order_index = 5;

update public.ppg_lesson_steps
  set body_en = '## What a storyboard means

Designing a storyboard means writing down the sequence of steps of the content you want to create — a presentation, an animation, multimedia for learning, or various mixed media — on paper in order to tell the story and arrange the order of the narrative and its elements.

In summary, designing a storyboard means creating a visual picture of the sequence of steps of the story you want to tell, especially the animation. The details used in the storyboard should describe and state the media used, such as text, pictures, animation, sound, and video.'
  where lesson_key = 'chapter-02-lesson-01' and order_index = 2;

update public.ppg_lesson_steps
  set body_en = '## Principles for writing a storyboard

Writing a storyboard is the step of preparing the presentation of text and pictures, as well as media in various multimedia forms, on paper, so that the text and media are presented appropriately on the computer screen.

The storyboard format consists of two parts: the visual part and the sound part. The storyboard is drawn inside rectangular frames, with narration, or with dialogue, music, and various sound effects.

Examples of preparing a storyboard include the topic of a presentation on the founding of ASEAN, where the details are spelled out for each part: what pictures, text, and animation it contains, whether there is background music, and how the actions are sequenced and the screen is laid out, as well as specifying the sources of the data, such as where the pictures and sound come from and from which source.

Use of language is one of the arts that lets the audience perceive and imagine the beauty of what happens in the content. An important part of using language is using words correctly and readably, as a basic requirement. The principle of writing the language of a narration is to write it as speech: the narrator talks with the audience. Therefore the writing should be in the manner of a conversation with the audience, as follows.

### 2.1 Use short, concise, and complete sentences

2.2 Use appropriate words that are correct and true to the meaning, and use figures of speech suited to the content

2.3 Use direct, plain communication that does not wander, so the audience does not have to interpret it

2.4 Use polite and friendly language, avoiding the following phrases: "Next, you will see" or "Please observe the screen now", and the phrase "finished"'
  where lesson_key = 'chapter-02-lesson-01' and order_index = 3;

update public.ppg_lesson_steps
  set body_en = '## 3. What is important inside a storyboard

3.1 Characters or scenes (people, animals, objects, places, cartoon characters); the important thing is the movement of those things

3.2 Camera angles, including image size, camera angle, and camera movement

3.3 The sound of dialogue between characters, and what sound effects or music are used'
  where lesson_key = 'chapter-02-lesson-01' and order_index = 4;

update public.ppg_lesson_steps
  set body_en = '## 4. Advantages of designing a storyboard

4.1 It helps keep the story continuous and on topic, because you read it from beginning to end before actually starting work.

4.2 It helps keep the story compact and on topic, because a plan has been set.

4.3 It helps set the amount of dialogue to fit and suit each page and speech balloon.

4.4 It helps ensure the story can finish within the set number of pages, which is the most important thing.'
  where lesson_key = 'chapter-02-lesson-02' and order_index = 2;

update public.ppg_lesson_steps
  set body_en = '## 5. Designing a storyboard

Designing a storyboard means showing the sequence of the whole story in pictures, step by step. Each piece of work differs in some parts, as follows.

5.1 Lay out the main plot, whether it is the theme, the main characters, the scenes, and so on.

### 5.1.1 Subject matter

### 5.1.2 Scenes

### 5.1.3 Story synopsis

### 5.1.4 Theme / core idea (the thought / what you want to communicate)

5.1.5 Characters — the important thing is to define the look of each character so that they stand out and are not too similar. Design each character''s appearance to be distinct, so that at a glance it conveys the character''s personality immediately.

### 5.2 A rough sequence of events

The key point is that every event is a cause and effect of one another; an earlier event makes the following event carry more weight, and you must find the story''s climax. This point is the most exciting moment before all the knots in the story are untied. Creating suspense for the reader is a key part of building the story; suspense makes readers ask questions in their minds and imagine the plot and ending in many different ways.

Text from the picture

### 5.3 Set the pages

5.4 Write the script — this is the last step before starting the storyboard. Write the dialogue and the thoughts in detail so that you can set the size of the speech balloons and lay them out on the page appropriately.

### 5.5 Start writing the storyboard'
  where lesson_key = 'chapter-02-lesson-02' and order_index = 3;

update public.ppg_lesson_steps
  set body_en = '## 6. Various storyboard formats

6.1 An example of the Comp. & IT (SIE) Computer Instruction Script form from the Faculty of Industrial Education, King Mongkut''s University of Technology Thonburi. It suits the creation of computer-assisted instruction (CAI) lessons, the development of e-learning lessons (E-Learning), and teaching materials.

### 6.2 An example of storyboard paper

6.3 An example of a storyboard form for creating an animation cartoon

### 6.4 An example of a two-part form: picture and script'
  where lesson_key = 'chapter-02-lesson-02' and order_index = 4;

update public.ppg_lesson_steps
  set body_en = '## 7. Preparing data for making a storyboard

The data for making a storyboard depends on the work you want to create. It may include text, pictures, sound, animation, and more, and must be prepared before it is used to build the program, as follows.

### 7.1 Content / story synopsis

### 7.2 Prepare pictures / design characters

### 7.3 Prepare sound

### 7.4 Create animation (Animation File)

### 7.5 Three storyboard formats

Example format 1: a diagram format

Example format 2: a sketch-outline format

Example format 3: a table format'
  where lesson_key = 'chapter-02-lesson-02' and order_index = 5;

update public.ppg_lesson_steps
  set body_en = 'An example of writing content details (content)

The content section is knowledge (Knowledge), the most important part of creating work that presents information, such as drawing cartoons, games, animation, making short films, or teaching materials.'
  where lesson_key = 'chapter-02-lesson-03' and order_index = 2;

update public.ppg_lesson_steps
  set body_en = '## An example of writing a storyboard script

Writing a storyboard script for creating a presentation, teaching material, animation, or other work differs in some parts, for example the example of an animation presentation and a slide show (Presentation).

A useful tip: a slide show presentation does not need character design.

Creating an animation has the following working method and steps for creating the animation.

- Define the content briefly
- Design the characters
- Prepare the storyboard
- Develop it using a ready-made presentation program'
  where lesson_key = 'chapter-02-lesson-03' and order_index = 3;

update public.ppg_lesson_steps
  set body_en = '## Using presentation programs'
  where lesson_key = 'chapter-03-lesson-01' and order_index = 2;

update public.ppg_lesson_steps
  set body_en = '## 1. Features of Microsoft PowerPoint

Microsoft PowerPoint is a popular program for creating presentations and is used to present information in the form of slides.

A slide is a single sheet that displays various things, including text, graphs, tables, pictures, and more. A slide can be shown on a sheet of paper, on an overhead projector, on a computer screen, or on a projector.

The reasons Microsoft PowerPoint is popular for creating presentations are as follows.

1. It is easy to use; you can create, edit, and add content conveniently.

2. It supports multimedia well. It can bring in video, animation (such as Flash movie), and sound, so the message is clearly visible and the presentation is more interesting.

3. It can be adapted to create a wide range of work. It can be applied to various kinds of work, for example a computer kiosk that presents information or is used for games.

4. It displays both on screen and on paper. You can present information on the screen and print documents.

5. It saves files in various formats, such as image files or web page files, so the work can be presented in other file types as needed. Microsoft PowerPoint can write PowerPoint documents, save a new kind of slide show, support video recording, ink recording, and narrator voice recording, arrange elements on a slide with the program showing elements in reading order on the page to the desired slide, provide easy-to-use motion graphics arrangement, and more.'
  where lesson_key = 'chapter-03-lesson-01' and order_index = 3;

update public.ppg_lesson_steps
  set body_en = '## 2. Opening Microsoft PowerPoint

Microsoft PowerPoint can be opened as follows.

Click the Start button.

Click the PowerPoint program icon.

A window appears for choosing the slide layout you want to use.

Click Blank Presentation.

The Microsoft PowerPoint program window opens.'
  where lesson_key = 'chapter-03-lesson-01' and order_index = 4;

update public.ppg_lesson_steps
  set body_en = '## 3. Parts of the Microsoft PowerPoint window

The parts of the Microsoft PowerPoint window are as follows.

Title Bar — the title bar shows the name of the file currently open.

Menu Bar — the bar that shows the command menus.

Ribbon/ToolBar — the tool bar that shows the various tool icons; it is made up of several tabs grouped together.

Status Bar — shows the working status and the page number in the document.

Slide Area — the area for designing and displaying text, pictures, numbers, tables, and charts; you can insert sound and video here.'
  where lesson_key = 'chapter-03-lesson-01' and order_index = 5;

update public.ppg_lesson_steps
  set body_en = '## 4. Slide layout and placeholders (Slide Layout and Placeholder)

A slide layout is a template for arranging the things that will appear on a slide. Each slide layout contains placeholders: outlined areas where the content of the slide set must be entered. Each layout shows different placeholders for the content that goes in the boxes, such as text, charts, SmartArt graphics, movies, sound, pictures, and clip art. There are also styles, special effects, and background lines in Microsoft PowerPoint.'
  where lesson_key = 'chapter-03-lesson-01' and order_index = 6;

update public.ppg_lesson_steps
  set body_en = '## 5. Views of the Microsoft PowerPoint window

Only the program''s views and other sub-components of Microsoft PowerPoint display the layout of the text on the slides.

1. Click Notes to show or hide the notes. This is the area used to type text that explains or narrates the slide you are working on; it appears in a bar at the bottom, below the slide, as follows:

Click to add notes

### 2. Click Comments

### 3. The program''s various views

Normal — used to edit or add objects to the slide.

Slide Sorter — shows all the slides; you can add, delete, or reorder slides here. It displays the slides as slide sorter thumbnails.

Reading View — used to read, or to view the presentation full screen.

Slide Show — this is the view for presenting the work by showing slides full screen, or by pressing Shift + F5 on the keyboard (note that the whole screen turns white).

Zoom In/Zoom Out — enlarges the slide window so you can see the details on the slide.

Zoom Level — click to open the zoom in/out dialog box.

Fit Slide to Current Window — fits the slide to the current window.'
  where lesson_key = 'chapter-03-lesson-01' and order_index = 7;

update public.ppg_lesson_steps
  set body_en = '## 6. Creating a presentation in Microsoft PowerPoint

There are three ways to create a presentation.

Method 1: Create with a blank presentation (Blank Presentation)

This method suits people who want to build the whole presentation by themselves. People skilled in creating presentations usually use this method because they have more freedom to design the presentation themselves. You can open a blank presentation as follows.

Click the File tab → New.

The New window appears.

Click Blank Presentation.

A blank presentation slide appears.

Method 2: Create a new presentation with a template (Template), a document template that serves as a model for the slides and helps manage the background, style, colour, and text, automatically making every slide look the same. You can do this as follows.

Open Microsoft PowerPoint, or click the File tab → New.

The Microsoft PowerPoint template window appears.

Click to select the Welcome to PowerPoint template (Welcome to PowerPoint).

The program''s template is displayed.

Click the (Create) button.

The Welcome to PowerPoint slide appears on the screen.

Click slide 2 to view its content.

Click the following slides to view their content, through to the last slide.

Method 3: Create a new presentation with themes (Themes), or installed theme sets. You can do this as follows.

Click the File tab → New.

The New window appears.

Click Themes (an internet connection is required to download them).

Click to select Architecture Design or another one.

The selected theme style is displayed.

Click the (Create) button.

The slide in the style you selected appears on the screen.'
  where lesson_key = 'chapter-03-lesson-02' and order_index = 2;

update public.ppg_lesson_steps
  set body_en = '## Viewing a Microsoft PowerPoint presentation

A presentation, or the slides you have already created, can be viewed in three ways.

Method 1

Click the Slide Show tab.

Click From Beginning.

Method 2

Click the Slide Show button (to present starting from the current slide, the slide shown on screen).

Method 3

Press F5 on the keyboard. While presenting, you can right-click on the screen to change and move between slides in several ways, as follows.

### 1. Right-click on the screen during the slide show to open a shortcut menu

Next — move to the next slide.

Previous — move to the previous slide.

Last Viewed — the slide shown most recently.

See All Slides — view all slides.

Zoom In — enlarge.

Custom Show — a custom presentation.

Show Presenter View — show the presenter view.

Screen — choose the screen for the presentation.

Pointer Options — choose the arrow pointer or the pen, and choose the pen colour.

Help — help with the slide presentation.

Pause — pause.

End Show — end the presentation and return to the normal slide window.

### 2. Click the tool buttons at the lower left

### 3. Click the pen and choose the style you want to use

### 4. Click the (...) button to show other items'
  where lesson_key = 'chapter-03-lesson-02' and order_index = 3;

update public.ppg_lesson_steps
  set body_en = '## Saving a file

After creating or editing a presentation, you should save the data. There are three ways to save it.

Method 1

Click the File tab → Save As.

Set the file name in File name: Welcome to PowerPoint (you can change it as you wish).

Click the Save button. The resulting file has the extension (.pptx), and the saved file is smaller than before.

Method 2

Click the File tab → Save.

Method 3

Click the Save tool button (Ctrl + S).'
  where lesson_key = 'chapter-03-lesson-02' and order_index = 4;

update public.ppg_lesson_steps
  set body_en = '## Opening a file quickly

Files you have used with Microsoft PowerPoint can be opened conveniently and quickly, making your work easier. The program shows a list of files you have opened before. You can do this as follows.

Click the File tab --> Open.

Click Recent to show the list of files you have opened before.

Click the file you want to open.'
  where lesson_key = 'chapter-03-lesson-02' and order_index = 5;

update public.ppg_lesson_steps
  set body_en = '## Closing the window and exiting Microsoft PowerPoint

You can close the window and exit Microsoft PowerPoint with the window close buttons, as follows.

Click the File tab --> Close to close the slide window.

Click the X (Close) button to close the Microsoft PowerPoint program window.'
  where lesson_key = 'chapter-03-lesson-02' and order_index = 6;

update public.ppg_lesson_steps
  set body_en = '## 7. Creating slide masters and templates

A slide master is the model for every slide. It sets the size, placeholders, appearance, position of objects on the slide, background, colour theme, and special effects, so that every slide you create shares the same foundation. There are three types of master: the Slide Master, the Handout Master, and the Note Master.

A template is a model file stored as a theme set in the theme gallery, which can be used to decorate slides afterwards. Template files have the extension (.potx or .pot).

### 7.1 Editing and saving a slide master

You can open the slide master theme set from the Theme command that the program provides, as follows.

Click the View tab.

Click the Slide Master button.

Click the Slide Master tab.

Click Themes to change the slide style.

Click to select a theme set, such as Organic.

Click the mouse on a text box on the slide.

Click Colors and choose the colour set for the presentation.

Click Fonts; the presentation''s font set lets you change to a new typeface and size.

Click the Shape Format tab --> the Shape Fill button.

Choose the colour you want.

Right-click the text box --> choose Format Shape...

Click Fill --> Picture or texture fill.

Click the Texture button.

Click the Close button.

### 7.2 Creating a slide master

Creating a slide master means designing a basic slide layout to use as a model for creating new slides; it suits work that is used often. You can do this as follows.

Click the View tab.

Click the Slide Master button.

Click the master slide (Slide Master) you want to use as the model, or another slide.

Right-click the slide.

Click Format Background...

Click the Picture or texture fill image.

A picture appears on the master slide.

Click the Apply to All button.

Click the Close Master View button.

### 7.3 Saving a slide master

When saving a slide master in Microsoft PowerPoint, a Microsoft PowerPoint design template has the extension .potx, and a Microsoft PowerPoint 97-2003 design template has the extension .pot. They can be used immediately for a new presentation. The saving steps are as follows.

Click the File button.

Click Save As.

Click Browse.

Name the template file, for example SlideMaster1.potx.

In the Save as type box, choose PowerPoint 97-2003 template.

Click the Save button.

The slide master is produced.

### 7.4 Using a slide master

Once the slide master has been saved, the next step is to try using it. You can use it as follows.

Click File.

Click New.

Click Personal.

Click the SlideMaster1.potx template, or choose another template you want.

Click the Create button.

The slide master file is displayed.

### 7.5 Adding more slide master styles

You can create a slide master with more than one master style by adding a new slide layout, so you can choose which master each slide uses. This suits slides that need a variety of styles. The steps are as follows.

Click the File button.

Click New.

Click to select the template you want to use.

Click the Create button; the selected template appears.

Click the View tab.

Click the Slide Master button.

Click the Insert Slide Master button.

Click the slide.

Click Rename.

Type Slide Master 2.

Click the Rename button.

Right-click the slide and choose Format Background...

Click the Picture or texture fill radio button.

Click the Insert... button.

Click Online Pictures.

Click the style you want, such as Beach.

Click to select the picture you want.

Click the Insert button.

The picture appears as the master slide background.

(If you want to cancel the slide master, press Delete on the first slide of the master) or right-click Slide --> Delete Master.

Click the Close Master View button.

If you want to delete the slide master, press the Delete button on the first slide of the master.'
  where lesson_key = 'chapter-03-lesson-03' and order_index = 2;
