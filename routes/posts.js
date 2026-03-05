const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');
const multer = require('multer');
const { v2: cloudinary } = require('cloudinary');
const { CloudinaryStorage } = require('multer-storage-cloudinary');
const Post = require('../models/Post');
const Comment = require('../models/Comment');
const { protect } = require('../middleware/auth');

// CLOUDINARY CONFIGURATION
cloudinary.config({
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
    api_key: process.env.CLOUDINARY_API_KEY,
    api_secret: process.env.CLOUDINARY_API_SECRET
});

const storage = new CloudinaryStorage({
    cloudinary: cloudinary,
    params: {
        folder: 'daplink_feed',
        resource_type: 'auto',
        allowed_formats: ['jpg', 'jpeg', 'png', 'gif', 'webp', 'avif', 'mp4', 'mov', 'webm']
    },
});

const upload = multer({ storage: storage });

// 🚀 AUTHOR MATCHER HELPER
async function populateAuthorsFromDB(items) {
    if (!items || items.length === 0) return items;

    const authorIds = new Set();
    items.forEach(item => {
        if (item.author) authorIds.add(item.author.toString());
    });

    if (authorIds.size === 0) return items;

    const db = mongoose.connection.db;
    const authorObjectIds = Array.from(authorIds).map(id => {
        try { return new mongoose.Types.ObjectId(id); } catch(e) { return null; }
    }).filter(Boolean);

    const users = await db.collection('users').find({ _id: { $in: authorObjectIds } }).toArray();

    const daplinkIds = users.map(u => {
        if (!u.daplinkID) return null;
        try { return typeof u.daplinkID === 'string' ? new mongoose.Types.ObjectId(u.daplinkID) : u.daplinkID; } catch(e) { return null; }
    }).filter(Boolean);

    const allLinkIds = [...daplinkIds, ...authorObjectIds];

    const linksData = await db.collection('links').find({ _id: { $in: allLinkIds } }).toArray();
    const linksMap = {};
    linksData.forEach(l => { linksMap[l._id.toString()] = l; });

    const authorMap = {};

    users.forEach(u => {
        const linkData = u.daplinkID && linksMap[u.daplinkID.toString()] ? linksMap[u.daplinkID.toString()] : {};
        authorMap[u._id.toString()] = {
            _id: u._id.toString(),
            name: u.name || linkData.handle || 'Unknown User',
            handle: linkData.handle || u.handle || 'unknown',
            profession: linkData.profession || u.profession || 'Creator',
            avatar: linkData.profile || u.avatar || `https://api.dicebear.com/7.x/avataaars/svg?seed=${linkData.handle || 'unknown'}`
        };
    });
    linksData.forEach(l => {
        if (!authorMap[l._id.toString()]) {
            authorMap[l._id.toString()] = {
                _id: l._id.toString(),
                name: l.name || l.handle || 'Unknown User',
                handle: l.handle || 'unknown',
                profession: l.profession || 'Creator',
                avatar: l.profile || `https://api.dicebear.com/7.x/avataaars/svg?seed=${l.handle || 'unknown'}`
            };
        }
    });

    items.forEach(item => {
        if (item.author) {
            item.author = authorMap[item.author.toString()] || {
                _id: item.author.toString(),
                name: 'Unknown User',
                handle: 'unknown',
                profession: 'Creator',
                avatar: `https://api.dicebear.com/7.x/avataaars/svg?seed=unknown`
            };
        }
    });

    return items;
}
// GET TRENDING TOPICS
router.get('/trending', protect, async (req, res, next) => {
    try {
        const sevenDaysAgo = new Date();
        sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

        const trending = await Post.aggregate([
            { $unwind: { path: "$tags", preserveNullAndEmptyArrays: false } },
            { $match: { createdAt: { $gte: sevenDaysAgo }, tags: { $type: "string", $ne: "" } } },
            { $group: { _id: { $toLower: "$tags" }, count: { $sum: 1 } } },
            { $sort: { count: -1 } },
            { $limit: 5 }
        ]);

        const formattedTrends = trending.map(t => ({
            tag: t._id,
            posts: t.count
        }));

        res.json({ success: true, trending: formattedTrends });
    } catch (error) {
        console.error("🔥 Trending Route Error:", error);
        next(error);
    }
});

// SEARCH USERS AND POSTS
router.get('/search', protect, async (req, res, next) => {
    try {
        const { q } = req.query;
        if (!q || q.trim() === '') {
            return res.json({ success: true, users: [], posts: [] });
        }

        const regex = new RegExp(q, 'i');

        const db = mongoose.connection.db;
        const matchedLinks = await db.collection('links').find({
            $or: [{ handle: regex }, { name: regex }, { profession: regex }]
        }).limit(5).toArray();

        const formattedUsers = matchedLinks.map(l => ({
            _id: l._id,
            name: l.name || l.handle,
            handle: l.handle,
            avatar: l.profile || `https://api.dicebear.com/7.x/avataaars/svg?seed=${l.handle}`,
            profession: l.profession || 'Creator'
        }));
        
        const rawPosts = await Post.find({
            $or: [{ content: regex }, { tags: regex }]
        }).sort({ createdAt: -1 }).limit(5).lean();
        const formattedPosts = await populateAuthorsFromDB(rawPosts);

        res.json({ success: true, users: formattedUsers, posts: formattedPosts });
    } catch (error) {
        console.error("🔥 Search Route Error:", error);
        next(error);
    }
});

// GET ALL POSTS
router.get('/', protect, async (req, res, next) => {
    try {
        const currentUserId = req.user._id.toString();
        const currentDaplinkId = req.user.daplinkID ? req.user.daplinkID.toString() : null;
        
        const { type } = req.query;
        let filter = {};
        
        const userIds = [currentUserId];
        if (currentDaplinkId) userIds.push(currentDaplinkId);

        if (type === 'myposts') {
            filter.author = { $in: userIds };
        } else {
            filter.author = { $nin: userIds };
        }

        const rawPosts = await Post.find(filter).sort({ createdAt: -1 }).limit(50).lean();
        const posts = await populateAuthorsFromDB(rawPosts);

        const formattedPosts = posts.map((post) => ({
            id: post._id,
            name: post.author?.name,
            authorId: post.author?._id,
            handle: `@${post.author?.handle}`,
            role: post.author?.profession,
            avatar: post.author?.avatar,
            content: post.content,
            mediaUrl: post.mediaUrl,
            mediaType: post.mediaType,
            time: post.createdAt,
            likes: post.likes ? post.likes.length : 0,
            comments: post.commentCount || 0,
            shares: post.shares || 0,
            tags: post.tags || [],
            xpReward: post.xpReward,
            verified: true,
            liked: post.likes ? post.likes.some(id => id.toString() === currentUserId) : false,
        }));

        res.json({ success: true, posts: formattedPosts });
    } catch (error) {
        next(error);
    }
});

// CREATE A POST
router.post('/', protect, upload.single('media'), async (req, res, next) => {
    try {
        const { content, tags, authorId } = req.body;

        if ((!content || !content.trim()) && !req.file) {
            return res.status(400).json({ success: false, message: 'Post must contain either text or media' });
        }

        let parsedTags = [];
        if (tags) {
            try { parsedTags = JSON.parse(tags); } catch (e) { parsedTags = [tags]; }
        }
        const resolvedAuthorId = authorId || req.user._id || req.user.daplinkID;

        const newPost = await Post.create({
            author: resolvedAuthorId,
            content: content ? content.trim() : '',
            tags: parsedTags,
            mediaUrl: req.file ? req.file.path : null,
            mediaType: req.file ? (req.file.mimetype.startsWith('video') ? 'video' : 'image') : null,
            xpReward: '+10 XP',
        });

        const populatedPost = await populateAuthorsFromDB([newPost.toObject()]);
        res.status(201).json({ success: true, post: populatedPost[0] });
    } catch (error) {
        next(error);
    }
});

// TOGGLE LIKE
router.post('/:id/like', protect, async (req, res, next) => {
    try {
        const postId = req.params.id;
        const userId = req.user._id;
        const post = await Post.findById(postId);
        if (!post) return res.status(404).json({ success: false, message: 'Post not found' });

        const hasLiked = post.likes.some(id => id.toString() === userId.toString());
        if (hasLiked) post.likes.pull(userId);
        else post.likes.addToSet(userId);

        await post.save();
        res.json({ success: true, liked: !hasLiked, likesCount: post.likes.length });
    } catch (error) {
        next(error);
    }
});

// GET COMMENTS
router.get('/:id/comments', protect, async (req, res, next) => {
    try {
        const rawComments = await Comment.find({ post: req.params.id }).sort({ createdAt: -1 }).lean();
        const comments = await populateAuthorsFromDB(rawComments);
        res.json({ success: true, comments });
    } catch (error) {
        next(error);
    }
});

// CREATE A COMMENT
router.post('/:id/comments', protect, async (req, res, next) => {
    try {
        const { content, authorId } = req.body;
        if (!content || !content.trim()) return res.status(400).json({ success: false, message: 'Empty comment' });

        const resolvedAuthorId = authorId || req.user._id || req.user.daplinkID;

        const newComment = await Comment.create({
            post: req.params.id,
            author: resolvedAuthorId,
            content: content.trim()
        });

        await Post.findByIdAndUpdate(req.params.id, { $inc: { commentCount: 1 } });
        const populatedComment = await populateAuthorsFromDB([newComment.toObject()]);
        res.status(201).json({ success: true, comment: populatedComment[0] });
    } catch (error) {
        next(error);
    }
});

// EDIT A POST
router.put('/:id', protect, async (req, res, next) => {
    try {
        const post = await Post.findById(req.params.id);
        if (!post) return res.status(404).json({ success: false, message: 'Post not found' });

        const authorStr = post.author.toString();
        const userStr = req.user._id.toString();
        const daplinkStr = req.user.daplinkID?.toString();

        if (authorStr !== userStr && authorStr !== daplinkStr) {
            return res.status(403).json({ success: false, message: 'Not authorized to edit this post' });
        }

        post.content = req.body.content.trim();
        await post.save();
        res.json({ success: true, post });
    } catch (error) {
        next(error);
    }
});

// DELETE A POST
router.delete('/:id', protect, async (req, res, next) => {
    try {
        const post = await Post.findById(req.params.id);
        if (!post) return res.status(404).json({ success: false, message: 'Post not found' });

        const authorStr = post.author.toString();
        const userStr = req.user._id.toString();
        const daplinkStr = req.user.daplinkID?.toString();

        if (authorStr !== userStr && authorStr !== daplinkStr) {
            return res.status(403).json({ success: false, message: 'Not authorized to delete this post' });
        }

        if (post.mediaUrl) {
            const urlParts = post.mediaUrl.split('/');
            const filename = urlParts[urlParts.length - 1];
            const publicId = `daplink_feed/${filename.split('.')[0]}`;
            const resourceType = post.mediaType === 'video' ? 'video' : 'image';
            await cloudinary.uploader.destroy(publicId, { resource_type: resourceType });
        }

        await post.deleteOne();
        await Comment.deleteMany({ post: req.params.id });
        res.json({ success: true, message: 'Post deleted' });
    } catch (error) {
        next(error);
    }
});

// REPOST
router.post('/:id/repost', protect, async (req, res, next) => {
    try {
        const post = await Post.findById(req.params.id);
        if (!post) return res.status(404).json({ success: false, message: 'Post not found' });
        post.shares += 1;
        await post.save();
        res.json({ success: true, shares: post.shares });
    } catch (error) {
        next(error);
    }
});

module.exports = router;