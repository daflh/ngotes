const {
    MongoClient,
    ObjectID
} = require("mongodb");

// env variable is declared in netlify site settings, not in config file nor dotenv
const MONGODB_URI = process.env.MONGODB_URI;
const DB_NAME = "ngotes";
const connectOptions = {
    useNewUrlParser: true,
    useUnifiedTopology: true
};

function toBoolean(input) {
    if (input === "true") {
        return true;
    }

    return !!input;
}

exports.handler = async (event, context) => {
    // get user data who make this request (passed in authorization header)
    const contextUser = context.clientContext.user;
    // last segment/part of request url, usually contains note id
    const pathLastSegment = event.path.split("/").pop();
    const params = event.queryStringParameters;
    const headers = event.headers;
    const body = headers["content-type"] == "application/json" ? JSON.parse(event.body) : event.body;
    const timestamp = Math.floor(Date.now() / 1000);
    const client = new MongoClient(MONGODB_URI, connectOptions);

    function response(statusCode, body) {
        // response "blueprint"
        return {
            statusCode,
            headers: {
                "Content-Type": "application/json",
                "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE"
            },
            body: JSON.stringify({
                status: statusCode < 400 ? 1 : 0,
                user_id: contextUser ? contextUser.sub : undefined,
                timestamp,
                ...body
            })
        };
    }

    if (!contextUser) return response(401, {
        message: "No authorization token provided"
    });

    try {
        // make a MongoDB connection
        await client.connect();
        
        const db = client.db(DB_NAME);
        const collection = db.collection("notes");

        switch (event.httpMethod) {
            // get user notes
            case "GET":
                let offset = params.hasOwnProperty("offset") ? Number(params.offset) : 0;
                // by default limit is 0, which means there's no limit
                let limit = params.hasOwnProperty("limit") ? Number(params.limit) : 0;
                const documentsFound = collection.find({ uid: contextUser.sub }, {
                    // pinned note comes first, then most recently modified comes first
                    sort: { pin: -1, lastModified: -1 },
                    // exclude 'uid' field from being returned
                    projection: { uid: 0 },
                    skip: offset,
                    limit
                });
    
                return response(200, {
                    data: await documentsFound.toArray()
                });

            // create a new note
            case "POST":
                // note title must be specified
                if (!body.hasOwnProperty("title")) {
                    throw new Error("Note \"title\" not specified");
                }

                const insertResult = await collection.insertOne({
                    uid: contextUser.sub,
                    title: body.title,
                    content: body.content || "",
                    // by default, pin is set to 'false'
                    pin: body.hasOwnProperty("pin") ? toBoolean(body.pin) : false,
                    created: timestamp,
                    lastModified: timestamp
                });

                return response(201, {
                    message: "Note inserted successfully",
                    inserted_id: insertResult.insertedId
                });

            // update an existing note
            case "PUT":
                let updateDocument = {
                    lastModified: timestamp
                };

                // one of the title/content/pin must exist in body
                if (body.hasOwnProperty("title")) updateDocument.title = body.title;
                if (body.hasOwnProperty("content")) updateDocument.content = body.content;
                if (body.hasOwnProperty("pin")) updateDocument.pin = toBoolean(body.pin);

                if (Object.keys(updateDocument).length === 1) {
                    throw new Error("At least specify one of \"title\", \"content\" or \"pin\" to update");
                }

                const updateResult = await collection.updateOne({
                    _id: ObjectID(pathLastSegment)
                }, { $set: updateDocument });
                const isModified = updateResult.modifiedCount > 0;

                return response(200, {
                    message: isModified ?  "Note updated successfully" : "No notes are updated",
                    updated_id: isModified ? pathLastSegment : undefined
                });

            // delete a note
            case "DELETE":
                const deleteResult = await collection.deleteOne({
                    _id: ObjectID(pathLastSegment)
                });
                const isDeleted = deleteResult.deletedCount > 0;

                return response(200, {
                    message: isDeleted ? "Note deleted successfully" : "No notes are deleted",
                    deleted_id: isDeleted ? pathLastSegment : undefined
                });

            // only GET/POST/PUT/DELETE method supported
            default:
                throw new Error("Invalid HTTP Method");
        }
        
    } catch (err) {
        return response(400, {
            message: err.message
        });
        
    } finally {
        // close MongoDB connection regardless whether error or not
        await client.close();
    }
}
