// check whether email is in valid format, returns a boolean
export function isValidEmail(email) {
    const regex = /^(([^<>()\[\]\\.,;:\s@"]+(\.[^<>()\[\]\\.,;:\s@"]+)*)|(".+"))@((\[[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\])|(([a-zA-Z\-0-9]+\.)+[a-zA-Z]{2,}))$/;
    
    return regex.test(String(email).toLowerCase());
}

// truncate string to a given length and add triple dots (…) after it
export function truncate(str, maxLength) {
    if (str.length <= maxLength) {
        return str;
    }

    const truncatedStr = str.substr(0, maxLength - 1);

    return truncatedStr.substr(0, truncatedStr.lastIndexOf(" ")) + " …";
}
