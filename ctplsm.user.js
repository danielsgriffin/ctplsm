// ==UserScript==
// @name         Contextual Twitter Poultice for Learning So Much (ctplsm)
// @namespace    http://tampermonkey.net/
// @version      0.2
// @description  Suggest alternative Twitter searches, and further searching.
// @author       danielsgriffin
// @match        https://twitter.com/search?q=*
// @grant       GM_xmlhttpRequest
// @grant       GM.setValue
// @grant       GM.getValue
// ==/UserScript==

// Check if the API key is saved in local storage
// The API key is stored relatively securely in local storage, which is a built-in feature of your browser.
// Local storage is a key-value store that is only accessible to the domain that created it.
// This means that the API key is only accessible to this script and cannot be accessed by other websites.

// It's worth noting that while the GM.setValue and GM.getValue functions offer some level of security
// (they store the values in an isolated environment), they are not a 100% foolproof method.
// Always be cautious about where and how you store sensitive information.
// You can create a new temporary key just for this use here: https://platform.openai.com/account/api-keys
// OpenAI does say this on that page: "Do not share your API key with others, or expose it in the browser
// or other client-side code."

// Please advise on better approaches! - danielsgriffin

(async function () {
    'use strict';

    var llmModelSelected = "gpt-3.5-turbo";

    let loggingPreference = await GM.getValue('loggingPreference', null);

    if (loggingPreference === null) {
        // User has not set a preference yet
        const consent = confirm(`Message from Contextual Twitter Poultice for Learning So Much (ctplsm):
        Do you want to enable logging for the ctplsm userscript?
        This will help improve prompts and other features in the future.
        Your data remains on your browser and is not sent anywhere.`);
        if (consent) {
            await GM.setValue('loggingPreference', true);
            loggingPreference = true;
        } else {
            await GM.setValue('loggingPreference', false);
            loggingPreference = false;
        }
    }

    // for testing only!
    // function clearLoggingPreference() {
    // GM.setValue('loggingPreference', null).then(() => {
    //     alert('Logging preference cleared!');
    // });
    // }

    // // Code to add a button for clearing preference (for testing purposes only)
    // const clearButton = document.createElement('button');
    // clearButton.innerText = "Clear Logging Preference";
    // clearButton.style.position = "fixed";
    // clearButton.style.bottom = "10px";
    // clearButton.style.right = "10px";
    // clearButton.style.zIndex = "9999"; // Ensuring it stays on top
    // clearButton.addEventListener('click', clearLoggingPreference);

    // document.body.appendChild(clearButton);

    function getLogs() {
        // Retrieve logs from localStorage
        const logs = localStorage.getItem('ctplsm_logs');

        // Parse and return the logs, or an empty array if none exist
        return logs ? JSON.parse(logs) : [];
    }

    function getFormattedTimestamp() {
        const now = new Date().toISOString();
        const date = now.slice(0, 10); // Extracts the date part: YYYY-MM-DD
        const time = now.slice(11, 19).replace(/:/g, '-'); // Extracts the time part and replaces ':' with '-'

        return `${date}_${time}`;
    }


    function addLog(entry) {
        const logs = getLogs();

        const serializedLogs = JSON.stringify(logs.concat(entry));
        const sizeInBytes = new Blob([serializedLogs]).size;

        if (sizeInBytes > 1000000) { // nearing 1MB
            alert('Your log data is nearing 1MB. Please consider downloading and clearing logs.');
            // You can also provide an option to download the logs here.
            return;
        }

        localStorage.setItem('ctplsm_logs', serializedLogs);
    }


    function clearLogs() {
        // Clear logs from localStorage
        localStorage.removeItem('ctplsm_logs');
    }

    function downloadLogs() {
        const logs = getLogs();
        const blob = new Blob([JSON.stringify(logs, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);

        const a = document.createElement('a');
        a.href = url;
        const timestamp = getFormattedTimestamp();
        a.download = `ctplsm_logs_${timestamp}.json`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    }

    // Retrieve the API key from local storage or prompt the user to enter it
    async function getApiKey() {
        let apiKey = await GM.getValue('apiKey');
        if (!apiKey) {
            apiKey = prompt("Please enter your API key:");
            await GM.setValue('apiKey', apiKey);
        }
        console.log(`apiKey: ${apiKey}`);
        return apiKey;
    }

    const apiKey = await getApiKey();

    addLog({ event: 'llmModelSelected:', content: `${llmModelSelected}`, timestamp: new Date().toISOString() });

    function requestLLM(system, inputText, callback) {
        const apiUrl = "https://api.openai.com/v1/chat/completions";

        GM_xmlhttpRequest({
            method: "POST",
            url: apiUrl,
            headers: {
                'Authorization': `Bearer ${apiKey}`,
                'Content-Type': 'application/json',
                'Accept': 'application/json'
            },
            data: JSON.stringify({
                model: llmModelSelected,
                messages: [
                    {
                        "role": "system",
                        "content": system
                    },
                    {
                        "role": "user",
                        "content": inputText
                    },
                ],
                temperature: 0,
                max_tokens: 256
            }),
            onload: function (response) {
                if (callback) {
                    callback(JSON.parse(response.responseText));
                }
            },
            onerror: function (err) {
                console.error('API call failed', err);
            }
        });
    }

    // 1. Extract the query parameter `q` from the URL.
    let query = new URLSearchParams(window.location.search).get('q');
    addLog({ event: 'query', content: `${query}`, timestamp: new Date().toISOString() });

    // Base search URL for re-use
    const baseSearchURL = "https://twitter.com/search?q=";

    // 2. Construct alternative searches based on the requirements.
    const altSearches = [
        `filter:follows`,
        `from:danielsgriffin`,
        `until:${new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]}`, // a week ago
        `min_faves:50`,
        `-filter:replies`,
        `filter:links`
    ];

    // 3. Create a ctplsm `div` element and insert it into the Twitter page.
    const div = document.createElement('div');
    div.id = 'ctplsm-div';
    document.body.appendChild(div);

    const viewportWidth = window.innerWidth;
    const desiredOffsetFromCenter = 700; // Replace with your desired offset
    const minLeft = 5; // Minimum distance from the left edge

    // Calculate left position based on viewport width and desired offset
    let calculatedLeft = (viewportWidth / 2) - desiredOffsetFromCenter;
    console.log(calculatedLeft)
    // Ensure calculatedLeft is not less than the minimum
    if (calculatedLeft < minLeft) {
        console.log("calculatedLeft is smaller?")
        calculatedLeft = minLeft;
    }

    div.style = `
        position: absolute;
        top: 5px;
        left: ${calculatedLeft}px;
        z-index: 10000;
        background: white;
        padding: 10px;
        border-radius: 5px;
        box-shadow: 0px 0px 5px rgba(0,0,0,0.2);
    `;

    const titleContainer = document.createElement('div'); // Container to hold the title and button on the same line
    titleContainer.id = 'ctplsm-title-div';
    titleContainer.style = "display: flex; align-items: center;"; // Flex to allow items on the same line with aligned centers

    const title = document.createElement('h3');
    title.style = "margin: 0; flex-grow: 1;"; // Remove margin and let it take all available space
    title.innerHTML = "Alternative searches";
    titleContainer.appendChild(title);

    titleContainer.setAttribute('role', 'heading'); // Set the role to "heading" for accessibility purposes
    titleContainer.setAttribute('aria-level', '2'); // Set the heading level to 2 for accessibility purposes

    const collapseButton = document.createElement('button');
    collapseButton.innerText = "⌄";
    collapseButton.style = "background: none; border: none; font-size: 1em; cursor: pointer; outline: none; padding-left: 1px; margin-left: 1px; margin-right: 5px"; // Make it discrete and position it to the right of the title
    collapseButton.setAttribute('aria-label', 'Collapse'); // Add an ARIA label to the collapse button for accessibility purposes

    titleContainer.appendChild(collapseButton);

    div.appendChild(titleContainer); // Append the container (with title and button) to the main div

    const contentDiv = document.createElement('div'); // This is a new div to wrap the contents for easy hide/show
    contentDiv.id = 'ctplsm-content-div';
    div.appendChild(contentDiv);


    collapseButton.addEventListener('click', function () {
        if (contentDiv.style.display === "block" || contentDiv.style.display === "") {
            contentDiv.style.display = "none";
            div.style.padding = "1px";
            div.style.paddingRight = "10px";
            collapseButton.style.paddingRight = "10px";
            collapseButton.innerText = "Alternative searches...";
            title.innerHTML = ""; // hides the title
            collapseButton.style.fontSize = "0.8em";
        } else {
            contentDiv.style.display = "block";
            collapseButton.innerText = "⌄";
            title.innerHTML = "Alternative searches"; // resets the title
            div.style.padding = "10px";
            title.style.fontSize = "1em"; // Reset title font size on expand
            collapseButton.style.fontSize = "1em";
        }
    });

    // Create the close button
    const closeButton = document.createElement('button');
    closeButton.setAttribute('aria-label', 'Close');
    closeButton.setAttribute('title', 'Close');
    closeButton.setAttribute('id', 'ctplsm-close-button');
    closeButton.innerHTML = '✖';

    // Style the close button
    closeButton.style = `
    position: absolute;
    top: 1px;
    right: 1px;
    background: none;
    border: none;
    color: red;
    cursor: pointer;
    font-size: 1em;
    outline: none;
`;

    // Add the event listener to the close button
    closeButton.addEventListener('click', () => {
        div.style.display = 'none';
    });

    // Append the close button and content div to the main div
    div.appendChild(closeButton);
    div.appendChild(contentDiv);



    function createSuggestedSearch(query, alt, llmQuery = false) {

        // Use alt as newQuery if llmQuery is true, else combine query and alt
        const newQuery = llmQuery ? alt.trim() : `${query} ${alt}`.trim();

        const newQueryLink = document.createElement('a');
        newQueryLink.setAttribute('id', 'ctplsm-new-query-link'); // Add an ID to the link for accessibility purposes
        newQueryLink.setAttribute('title', 'Create a new query'); // Add a title attribute to the link for accessibility purposes
        newQueryLink.setAttribute('aria-label', 'Create a new query'); // Add an ARIA label to the link for accessibility purposes
        newQueryLink.href = `https://twitter.com/search?q=${encodeURIComponent(newQuery)}`;
        newQueryLink.innerText = newQuery;
        contentDiv.appendChild(newQueryLink);

        const newTabLink = document.createElement('a');
        newTabLink.setAttribute('id', 'ctplsm-new-tab-link'); // Add an ID to the link for accessibility purposes
        newTabLink.setAttribute('title', 'Open in a new tab'); // Add a title attribute to the link for accessibility purposes
        newTabLink.setAttribute('aria-label', 'Open in a new tab'); // Add an ARIA label to the link for accessibility purposes
        newTabLink.href = `https://twitter.com/search?q=${encodeURIComponent(newQuery)}`;
        newTabLink.innerHTML = "↗";
        newTabLink.style = "font-weight: 700; text-decoration: none; margin-left: 5px;";
        newTabLink.target = '_blank';
        contentDiv.appendChild(newTabLink);

        contentDiv.appendChild(document.createElement('br')).setAttribute('role', 'separator');
    }


    // 4. Add links for each alternate search.
    altSearches.forEach(alt => {
        if (!query.includes(alt)) {
            createSuggestedSearch(query, alt);
        }
    });


    // 5. Add a link to switch to the "Latest" search results.
    let hr = document.createElement('hr');
    hr.setAttribute('role', 'separator'); // Add a role attribute to the hr element for accessibility purposes
    contentDiv.appendChild(hr);
    const latestSearch = `${baseSearchURL}${query}&f=live`;
    const latestDiv = document.createElement('div');
    latestDiv.setAttribute('id', 'ctplsm-latest-div'); // Add an ID to the div for accessibility purposes
    latestDiv.setAttribute('title', 'Latest tweets'); // Add a title attribute to the div for accessibility purposes
    latestDiv.setAttribute('aria-label', 'Latest tweets'); // Add an ARIA label to the div for accessibility purposes
    latestDiv.style = "margin-top: 10px; padding: 5px; background: yellow; display: inline-block; border-radius: 3px;";
    latestDiv.innerHTML = `<mark>Remember: <a href="${latestSearch}" target="_self">Latest</a></mark>`;
    contentDiv.appendChild(latestDiv);

    // 6. Add a suggested search from OpenAI.
    contentDiv.appendChild(hr);
    const suggestedSearchDiv = document.createElement('div');
    suggestedSearchDiv.setAttribute('id', 'ctplsm-suggested-search-div'); // Add an ID to the div for accessibility purposes
    suggestedSearchDiv.setAttribute('title', 'Generated text'); // Add a title attribute to the div for accessibility purposes
    suggestedSearchDiv.setAttribute('aria-label', 'Generated text'); // Add an ARIA label to the div for accessibility purposes    suggestedSearchDiv.style = "margin-top: 10px; padding: 5px; display: inline-block; border-radius: 3px;";
    suggestedSearchDiv.innerHTML = `A note and suggested query from ${llmModelSelected}:\n`;
    contentDiv.appendChild(suggestedSearchDiv);
    contentDiv.appendChild(document.createElement('br')).setAttribute('role', 'separator');

    /**
    * Modifies a query string and returns it in a specific format with an optional note.
    * @param {string} query - The original query string.
    * @returns {string} - The modified query string in the specified format.
    */
    function modifyQuery(query) {
        query = query.replace(/filter:follows|from:danielsgriffin/g, "");

        let note = "";

        // Check if "llm" exists as a word in the query (case-insensitive)
        if (/\bllm\b/i.test(query)) {
            note = `LLM *very likely* means large language model.
            Do NOT assume it means 'Master of Laws'!
            Do NOT mention Master of Laws in your response!`;
        }

        // Format the query and note as specified, making (optional) truly optional
        const formattedQuery = note
            ? `Query: [${query}]\nNote: ${note}`
            : `Query: [${query}]`;

        return formattedQuery;
    }

    var modifiedQueryObject = modifyQuery(query);
    addLog({ event: 'modifiedQueryObject', content: `${modifiedQueryObject}`, timestamp: new Date().toISOString() });
    console.log(`modifiedQueryObject: ${modifiedQueryObject}`);
    var system = `
    You will be provided with a search query entered on Twitter.com.
    Your task is to suggest an alternative query.

    Expected input format:
    Query: [{query}]
    Note: {note} (optional)

    Respond with ONLY the suggested query text, no explanations or extra content.

    Expected output format:
    {suggested_query}`
    requestLLM(system, modifiedQueryObject, function (response) {
        const newQueryFromLLM = response.choices[0].message.content.trim();
        createSuggestedSearch(query, newQueryFromLLM, true);
        console.log("newQueryFromLLM:", newQueryFromLLM)
        addLog({ event: 'newQueryFromLLM', content: `${newQueryFromLLM}`, timestamp: new Date().toISOString() });
    });
    console.log(`System message for suggested query: ${system}`);
    system = `
    You will be provided with a search query entered on Twitter.com.
    Your task is to provide some contextually relevant tidbit for the searcher.
    This may be an interesting fact about the query topic,
    an idea about conducting a search on the query topic,
    or something else useful.

    Expected input format:
    Query: [{query}]
    Note: {note} (optional)

    You do NOT need to provide the original query in your response.`
    console.log(`System message for note: ${system}`);
    contentDiv.appendChild(document.createElement('br')).setAttribute('role', 'separator');
    requestLLM(system, modifiedQueryObject, function (response) {
        const noteFromLLM = response.choices[0].message.content.trim();
        addLog({ event: 'noteFromLLM', content: `${noteFromLLM}`, timestamp: new Date().toISOString() });

        const noteDiv = document.createElement('div');
        noteDiv.setAttribute('id', 'ctplsm-note-div'); // Add an ID to the div for accessibility purposes
        noteDiv.setAttribute('title', 'Note'); // Add a title attribute to the div for accessibility purposes
        noteDiv.setAttribute('aria-label', 'Note'); // Add an ARIA label to the div for accessibility purposes
        noteDiv.style.maxWidth = '200px';
        noteDiv.style.border = '1px solid black'; // Adjust as needed, for example '1px solid #cccccc' for a light gray border
        noteDiv.style.padding = '10px'; // Optional: to give some spacing inside the bordered area
        noteDiv.style.overflowWrap = 'break-word'; // Ensures long words don't overflow
        const para = document.createElement('p')
        para.innerHTML = noteFromLLM;

        noteDiv.appendChild(para); // Appends the paragraph to the note div
        contentDiv.appendChild(noteDiv); // Appends the note div to the main contentDiv

        // Create heading for links
        const linkHeading = document.createElement('h3');
        linkHeading.setAttribute('id', 'ctplsm-link-heading'); // Add an ID to the heading for accessibility purposes
        linkHeading.setAttribute('title', 'Links'); // Add a title attribute to the heading for accessibility purposes
        linkHeading.setAttribute('aria-label', 'Links'); // Add an ARIA label to the heading for accessibility purposes
        linkHeading.innerHTML = "Check elsewhere:";
        contentDiv.appendChild(linkHeading);

        // 1. Construct the four query formats
        const baseQuery = `Please find results on the web to verify or learn more about this statement: ${noteFromLLM}`;
        const metaphorQuery = `"${noteFromLLM}" Verify or learn more here:`;
        addLog({ event: 'Check elsewhere: baseQuery', content: `${baseQuery}`, timestamp: new Date().toISOString() });

        addLog({ event: 'Check elsewhere: metaphorQuery', content: `${metaphorQuery}`, timestamp: new Date().toISOString() });

        // 2. URL-encode each query
        const baseEncodedQuery = encodeURIComponent(baseQuery);
        const metaphorEncodedQuery = encodeURIComponent(metaphorQuery);

        // 3. Replace %s with each URL-encoded query in the respective URLs
        const urls = [
            { url: `https://www.perplexity.ai/search/?q=${baseEncodedQuery}`, name: "Perplexity AI" },
            { url: `https://you.com/search?q=${baseEncodedQuery}&tbm=youchat`, name: "You.com" },
            { url: `https://www.phind.com/search?q=${baseEncodedQuery}`, name: "Phind" },
            { url: `https://metaphor.systems/search?&q=${metaphorEncodedQuery}`, name: "Metaphor" }
        ];

        // 4. Create link elements for each search engine and append them to the document
        for (const { url, name } of urls) {
            const link = document.createElement('a');
            link.setAttribute('id', 'ctplsm-link'); // Add an ID to the link for accessibility purposes
            link.setAttribute('title', name); // Add a title attribute to the link with the link name for accessibility purposes
            link.setAttribute('aria-label', name); // Add an ARIA label to the link with the link name for accessibility purposes
            link.href = url;
            link.innerHTML = name;
            link.target = "_blank"; // Opens link in a new tab/window
            link.style.display = "block"; // Makes each link appear on a new line
            contentDiv.appendChild(link);
        }

    });

    // You can add this button to the UI for users to download logs:
    const downloadButton = document.createElement('button');
    downloadButton.innerText = 'Download Logs';
    downloadButton.onclick = downloadLogs;
    div.appendChild(downloadButton);

    document.body.appendChild(div);

    // Testing
    // addLog({event: 'testEvent', details: 'This is a test log.'});
    // console.log(getLogs()); // to verify the logs in the console
})();
